"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Bus position `off` seconds into a trip: straight line between stops.
// ponytail: ignores road shape (shapes.txt), use it if straight lines look wrong on curvy routes.
function at(stops, off) {
  const i = stops.findLastIndex((s) => s[2] <= off),
    a = stops[i],
    b = stops[i + 1];
  if (!b) return { ll: [a[0], a[1]], next: a[3] };
  const f = (off - a[2]) / (b[2] - a[2]);
  return {
    ll: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
    next: b[3],
  };
}
console.assert(
  at(
    [
      [0, 0, 0, "A"],
      [2, 4, 100, "B"],
    ],
    50,
  ).ll.join() === "1,2",
);

// Every bus on the road now: departures every headway inside each frequency window.
// ponytail: buses that left before midnight vanish at 00:00.
function active(trips, now, day, route) {
  const out = [];
  trips.forEach((t, ti) => {
    if (!t.d[day] || (route && t.r !== route)) return;
    const dur = t.s.at(-1)[2];
    for (const [s, e, h] of t.f) {
      const k0 = Math.max(0, Math.ceil((now - dur - s) / h)),
        k1 = Math.min(Math.floor((e - s) / h), Math.floor((now - s) / h));
      for (let k = k0; k <= k1; k++)
        out.push({ id: ti + ":" + (s + k * h), t, off: now - s - k * h });
    }
  });
  return out;
}

// Seconds until the next bus of trip `t` reaches the stop `off` seconds into the trip.
function eta(t, off, now) {
  let best = Infinity;
  for (const [s, e, h] of t.f) {
    const dep = s + Math.max(0, Math.ceil((now - off - s) / h)) * h;
    if (dep <= e) best = Math.min(best, dep + off - now);
  }
  return best;
}
console.assert(
  eta({ f: [[0, 1000, 100]] }, 30, 250) === 80 &&
    eta({ f: [[0, 1000, 100]] }, 30, 2000) === Infinity,
);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtDist = (d) =>
  d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1) + " km";
// Dark or light badge text, whichever reads on the route colour.
const ink = (c) =>
  parseInt(c.slice(1, 3), 16) * 0.299 +
    parseInt(c.slice(3, 5), 16) * 0.587 +
    parseInt(c.slice(5, 7), 16) * 0.114 >
  150
    ? "#0a0f1d"
    : "#fff";
const clockNow = () => {
  const d = new Date();
  return {
    d,
    now: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(),
    day: (d.getDay() + 6) % 7,
  };
};

const Card = ({ kind, name, href, d, rows, empty }) => (
  <section className="card">
    <span className="label kind">{kind}</span>
    <h4>
      <span>{href ? <a href={href}>{name}</a> : name}</span>
      <small>{fmtDist(d)}</small>
    </h4>
    {rows.length ? (
      rows.map((r, i) => (
        <div className="row" key={i}>
          <span
            className="badge"
            style={
              r.color ? { "--b": r.color, "--bi": ink(r.color) } : undefined
            }
          >
            {r.badge}
          </span>
          <span>{r.text}</span>
          <span className="eta">{r.eta}</span>
        </div>
      ))
    ) : (
      <div className="row mute">{empty}</div>
    )}
  </section>
);

export default function TJ() {
  const mapEl = useRef(),
    sheetEl = useRef(),
    g = useRef({}).current; // Leaflet objects + loaded data
  const [ready, setReady] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [route, setRoute] = useState("");
  const [count, setCount] = useState(null);
  const [clock, setClock] = useState("--.--");
  const [me, setMe] = useState(null);
  const [near, setNear] = useState(null); // status text or list of cards
  const [locating, setLocating] = useState(false);

  // Leaflet touches `window` on import, so load it client-side only.
  useEffect(() => {
    let dead = false;
    import("leaflet").then(async ({ default: L }) => {
      if (dead) return;
      const map = L.map(mapEl.current, {
        preferCanvas: true,
        zoomControl: false,
      }).setView([-6.2, 106.83], 12);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      Object.assign(g, {
        L,
        map,
        lines: L.layerGroup().addTo(map),
        nearLayer: L.layerGroup().addTo(map),
        buses: new Map(),
        krlSchedule: {},
      });
      const [krl, trips] = await Promise.all(
        ["/krl.json", "/tj.json"].map((u) => fetch(u).then((r) => r.json())),
      );
      if (dead) return;
      // One halte per name + ~100 m cell, so both platforms of a stop merge.
      const halte = new Map();
      trips.forEach((t) =>
        t.s.forEach(([lat, lon, off, name]) => {
          const key = `${name}@${lat.toFixed(3)},${lon.toFixed(3)}`;
          if (!halte.has(key))
            halte.set(key, { name, ll: [lat, lon], serve: [] });
          halte.get(key).serve.push([t, off]);
        }),
      );
      Object.assign(g, { krl, trips, halte });
      setRoutes(
        [...new Map(trips.map((t) => [t.r, t.n]))].sort(([a], [b]) =>
          a.localeCompare(b, "id", { numeric: true }),
        ),
      );
      setReady(true);
    });
    return () => {
      dead = true;
      g.map?.remove();
    };
  }, [g]);

  // Route lines + moving buses, redrawn when the corridor filter changes.
  useEffect(() => {
    if (!ready) return;
    const { L, map, lines, buses, trips } = g;
    lines.clearLayers();
    trips
      .filter((t) => !route || t.r === route)
      .forEach((t) =>
        L.polyline(
          t.s.map((s) => [s[0], s[1]]),
          { color: t.c, weight: route ? 4 : 1.5, opacity: route ? 0.8 : 0.35 },
        ).addTo(lines),
      );
    if (route)
      map.fitBounds(
        lines
          .getLayers()
          .map((l) => l.getBounds())
          .reduce((a, b) => a.extend(b)),
      );

    const tick = () => {
      const { d, now, day } = clockNow(),
        list = active(trips, now, day, route),
        seen = new Set();
      for (const b of list) {
        const p = at(b.t.s, b.off);
        seen.add(b.id);
        let m = buses.get(b.id);
        if (!m) {
          m = L.circleMarker(p.ll, {
            radius: 5,
            color: "#0a0f1d",
            weight: 1.5,
            fillColor: b.t.c,
            fillOpacity: 1,
          }).addTo(map);
          buses.set(b.id, m);
        }
        m.setLatLng(p.ll).bindTooltip(
          `<b>${esc(b.t.r)}</b> ${esc(b.t.h)}<br><span class="mute">berikut:</span> ${esc(p.next)}`,
        );
      }
      for (const [id, m] of buses)
        if (!seen.has(id)) {
          m.remove();
          buses.delete(id);
        }
      setCount(list.length);
      setClock(
        d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      );
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [ready, route, g]);

  // Nearest halte + KRL stations around the user, refreshed on every GPS fix and every 30 s.
  useEffect(() => {
    if (!ready || !me) return;
    const { L, map, nearLayer } = g;
    if (!g.meMarker) {
      g.meMarker = L.circleMarker(me, {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: "#ffb81c",
        fillOpacity: 1,
      })
        .bindTooltip("Kamu")
        .addTo(map);
      map.setView(me, 15, { animate: false });
      // Bottom-sheet layout covers the lower map: nudge the dot into the visible part.
      const sheet = sheetEl.current;
      if (sheet.offsetLeft < 20 && sheet.offsetWidth > innerWidth - 40)
        map.panBy([0, sheet.offsetHeight / 2], { animate: false });
    }
    g.meMarker.setLatLng(me);

    let alive = true;
    const update = async () => {
      const { now, day } = clockNow();
      const closest = (list, n) =>
        list
          .map((x) => ({ ...x, d: map.distance(me, x.ll) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, n);
      const stops = closest([...g.halte.values()], 3);
      const stations = closest(
        Object.entries(g.krl).map(([id, [lat, lon, name]]) => ({
          id,
          name,
          ll: [lat, lon],
        })),
        2,
      );

      nearLayer.clearLayers();
      [...stops, ...stations].forEach((x) =>
        L.circleMarker(x.ll, {
          radius: 9,
          color: x.id ? "#ff5a5f" : "#4da3ff",
          weight: 3,
          fill: false,
        })
          .bindTooltip(esc(x.name))
          .addTo(nearLayer),
      );

      const halteCards = stops.map((x) => {
        const next = new Map();
        for (const [t, off] of x.serve) {
          if (!t.d[day]) continue;
          const key = `${t.r} → ${t.h}`,
            s = eta(t, off, now);
          if (s < (next.get(key)?.s ?? Infinity)) next.set(key, { t, s });
        }
        const rows = [...next.values()]
          .filter((a) => a.s < Infinity)
          .sort((a, b) => a.s - b.s)
          .slice(0, 5)
          .map(({ t, s }) => ({
            badge: t.r,
            color: t.c,
            text: t.h,
            eta: s < 60 ? "tiba" : Math.round(s / 60) + "′",
          }));
        return {
          kind: "Halte TransJakarta",
          name: x.name,
          d: x.d,
          rows,
          empty: "tidak ada bus lagi hari ini",
        };
      });

      const krlCards = await Promise.all(
        stations.map(async (x) => {
          g.krlSchedule[x.id] ??= fetch(
            "https://api.comuline.com/v1/schedule/" + x.id,
          )
            .then((r) => r.json())
            .then((j) => j.data)
            .catch(() => []);
          // Same WIB-labelled-as-UTC quirk as the KRL page: read HH:MM straight off the string.
          const rows = (await g.krlSchedule[x.id])
            .map((s) => ({ ...s, t: s.departs_at.slice(11, 16) }))
            .filter((s) => +s.t.slice(0, 2) * 3600 + +s.t.slice(3) * 60 >= now)
            .sort((a, b) => a.t.localeCompare(b.t))
            .slice(0, 4)
            .map((s) => ({
              badge: s.train_id,
              text: s.route.replace("-", " → "),
              eta: s.t,
            }));
          return {
            kind: "Stasiun KRL",
            name: x.name,
            href: "/?st=" + encodeURIComponent(x.id),
            d: x.d,
            rows,
            empty: "tidak ada kereta lagi hari ini",
          };
        }),
      );

      if (alive) setNear([...halteCards, ...krlCards]);
    };
    update();
    const id = setInterval(update, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ready, me, g]);

  const locate = () => {
    setLocating(true);
    setNear("mencari lokasi…");
    navigator.geolocation.watchPosition(
      (p) => setMe([p.coords.latitude, p.coords.longitude]),
      (err) => {
        setNear("Lokasi gagal: " + err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true },
    );
  };

  return (
    <>
      <title>Peta TransJakarta</title>
      <div id="map" ref={mapEl} />
      <aside className="sheet" ref={sheetEl}>
        <header className="top">
          <div className="brand">Transumku</div>
          <nav className="tabs">
            <Link href="/">KRL</Link>
            <Link className="on" href="/tj">
              TransJakarta
            </Link>
          </nav>
        </header>
        <div className="stats">
          <div className="stat">
            <span className="label">Bus di jalan</span>
            <b>{count?.toLocaleString("id-ID") ?? "…"}</b>
          </div>
          <div className="stat">
            <span className="label">Jam</span>
            <b>{clock}</b>
          </div>
        </div>
        <label>
          <span className="label">Koridor</span>
          <select
            className="big"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
          >
            <option value="">Semua koridor</option>
            {routes.map(([r, n]) => (
              <option key={r} value={r}>
                {r} · {n}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={locating} onClick={locate}>
          Lokasi saya + terdekat
        </button>
        <div id="near">
          {typeof near === "string" ? (
            <p className="mute">{near}</p>
          ) : (
            near?.map((c, i) => <Card key={i} {...c} />)
          )}
        </div>
        <p className="note mute">
          Posisi bus = simulasi dari jadwal GTFS (headway), bukan GPS.
        </p>
      </aside>
    </>
  );
}
