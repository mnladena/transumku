"use client";
import { useEffect, useState } from "react";
import Search from "./Search";
import Tabs from "./Tabs";
import { CLOCK, Ico, PIN, TRAIN } from "./icons";

const API = "https://api.comuline.com/v1";
const get = (url) =>
  fetch(API + url)
    .then((r) => r.json())
    .then((j) => j.data);
// API stores WIB wall-clock time labelled +00, so read HH:MM straight off the string.
const mins = (s) => +s.slice(11, 13) * 60 + +s.slice(14, 16);
const routes = {};

// stops: [{station_name, departs_at}] sorted by time. ponytail: ignores trips crossing midnight.
function posisi(stops, now) {
  const t = stops.map((s) => mins(s.departs_at));
  if (now < t[0]) return `belum berangkat dari ${stops[0].station_name}`;
  if (now >= t.at(-1)) return `sudah di ${stops.at(-1).station_name}`;
  const i = t.findLastIndex((x) => x <= now);
  return now === t[i]
    ? `di ${stops[i].station_name}`
    : `antara ${stops[i].station_name} → ${stops[i + 1].station_name}`;
}

// Fractional stop index at `now` (seconds of day): 2.5 = halfway between stop 2 and 3.
function frac(stops, now) {
  const t = stops.map((s) => mins(s.departs_at) * 60);
  if (now <= t[0]) return 0;
  if (now >= t.at(-1)) return t.length - 1;
  const i = t.findLastIndex((x) => x <= now);
  return i + (now - t[i]) / (t[i + 1] - t[i]);
}

const A = { station_name: "A", departs_at: "2024-01-01 10:00" },
  B = { station_name: "B", departs_at: "2024-01-01 10:05" };
console.assert(posisi([A, B], 602) === "antara A → B");
console.assert(
  frac([A, B], 36000 + 150) === 0.5 &&
    frac([A, B], 0) === 0 &&
    frac([A, B], 99999) === 1,
);

export default function KRL() {
  const [stations, setStations] = useState([]);
  const [st, setSt] = useState("");
  const [shown, setShown] = useState(null);
  const [info, setInfo] = useState("");
  const [anim, setAnim] = useState(true);
  const [now, setNow] = useState(null); // null until mounted, so server and client HTML match

  useEffect(() => {
    get("/station").then((all) => {
      setStations(
        all
          .filter((s) => s.type === "KRL")
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSt(
        new URLSearchParams(location.search).get("st") ||
          localStorage.st ||
          "MRI",
      );
    });
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load the station's schedule; list refreshes every 30 s, train icons every second.
  useEffect(() => {
    if (!st) return;
    localStorage.st = st;
    let schedule = null,
      alive = true;
    const render = async () => {
      const d = new Date(),
        m = d.getHours() * 60 + d.getMinutes();
      const list = await Promise.all(
        schedule
          .filter(
            (s) => mins(s.departs_at) >= m - 1 && mins(s.departs_at) <= m + 45,
          )
          .sort((a, b) => mins(a.departs_at) - mins(b.departs_at))
          .map(async (s) => {
            routes[s.train_id] ??= get("/route/" + encodeURIComponent(s.train_id)) // some IDs contain "/", e.g. D1/R5022A
              .then((d) =>
                d.routes.sort(
                  (a, b) => mins(a.departs_at) - mins(b.departs_at),
                ),
              )
              .catch(() => null);
            return { ...s, stops: await routes[s.train_id] };
          }),
      );
      if (!alive) return;
      setShown(list);
      setInfo(
        "update " +
          new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
    };
    setInfo("memuat…");
    setAnim(true); // stagger cards only on station change, not every refresh
    get("/schedule/" + st).then((d) => {
      schedule = d;
      render();
    });
    const id = setInterval(() => {
      setAnim(false);
      if (schedule) render();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [st]);

  const nowM = now && now.getHours() * 60 + now.getMinutes();
  const nowS = now && nowM * 60 + now.getSeconds();

  return (
    <main className="krl">
      <title>Posisi KRL</title>
      <header className="top">
        <div className="brand">Transumku</div>
        <Tabs on="/" />
        <div className="clock">
          {now ? now.toLocaleTimeString("id-ID") : "--.--.--"}
        </div>
      </header>
      <label className="pick">
        <span className="label">
          <Ico svg={PIN} /> Stasiun keberangkatan
        </span>
        <Search
          value={st}
          onChange={setSt}
          options={stations.map((s) => [s.id, s.name, s.id])}
        />
      </label>
      <div className="status mute">
        <span>45 menit ke depan</span>
        <span>{info}</span>
      </div>
      <ul className={anim ? "deps anim" : "deps"}>
        {shown?.map((s, k) => {
          const c = /^#[0-9a-f]{3,8}$/i.test(s.metadata?.origin?.color)
            ? s.metadata.origin.color
            : undefined;
          const due = mins(s.departs_at) - nowM,
            parts = s.route.split("-");
          const ok = s.stops?.length > 1,
            n = ok && s.stops.length - 1;
          return (
            <li
              className="dep"
              key={s.train_id + s.departs_at}
              style={{ "--i": k, "--c": c }}
            >
              <div>
                <div className="time">{s.departs_at.slice(11, 16)}</div>
                <span className={due <= 0 ? "in now" : "in"}>
                  <Ico svg={CLOCK} />
                  {due <= 0 ? "berangkat" : due + " mnt"}
                </span>
              </div>
              <div>
                <div className="dest">
                  <Ico svg={TRAIN} />
                  {parts.at(-1)}
                </div>
                <div className="meta">
                  {s.train_id} · dari {parts[0]} · {s.line}
                </div>
                <div className="pos">
                  <Ico svg={PIN} />
                  {ok ? posisi(s.stops, nowM) : "rute tidak tersedia"}
                </div>
              </div>
              {ok && (
                <div className="ride">
                  <div className="track">
                    {s.stops.map((x, i) => (
                      <i
                        key={i}
                        style={{ left: (i / n) * 100 + "%" }}
                        className={x.station_id === st ? "here" : ""}
                        title={`${x.station_name} ${x.departs_at.slice(11, 16)}`}
                      />
                    ))}
                    <b
                      title="posisi kereta"
                      style={{ left: (frac(s.stops, nowS) / n) * 100 + "%" }}
                      dangerouslySetInnerHTML={{ __html: TRAIN }}
                    />
                  </div>
                  <div className="ends">
                    <span>{s.stops[0].station_name}</span>
                    <span>{s.stops[n].station_name}</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {shown?.length === 0 && (
          <li className="empty mute">Tidak ada kereta 45 menit ke depan.</li>
        )}
      </ul>
      <footer className="mute">
        Posisi = estimasi dari jadwal (api.comuline.com), bukan GPS.
      </footer>
    </main>
  );
}
