// Schedule maths shared by the map page (browser) and the push cron (server).

// Seconds until the next bus of trip `t` reaches the stop `off` seconds into the trip.
export function eta(t, off, now) {
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

// One halte per name + ~100 m cell, so both platforms of a stop merge.
export function buildHalte(trips) {
  const halte = new Map();
  trips.forEach((t) =>
    t.s.forEach(([lat, lon, off, name]) => {
      const key = `${name}@${lat.toFixed(3)},${lon.toFixed(3)}`;
      if (!halte.has(key)) halte.set(key, { key, name, ll: [lat, lon], serve: [] });
      halte.get(key).serve.push([t, off]);
    }),
  );
  return halte;
}

// Next bus per route + headsign at a halte, soonest first: [{t, s}] with s = seconds away.
export function nextBuses(halte, now, day) {
  const next = new Map();
  for (const [t, off] of halte.serve) {
    if (!t.d[day]) continue;
    const key = `${t.r} → ${t.h}`,
      s = eta(t, off, now);
    if (s < (next.get(key)?.s ?? Infinity)) next.set(key, { t, s });
  }
  return [...next.values()].filter((a) => a.s < Infinity).sort((a, b) => a.s - b.s);
}

// Upcoming departures from a comuline station schedule, soonest first, with t = "HH:MM" and sec = seconds away.
// Same WIB-labelled-as-UTC quirk as the KRL page: read HH:MM straight off the string.
export const nextTrains = (schedule, now) =>
  schedule
    .map((s) => {
      const t = s.departs_at.slice(11, 16);
      return { ...s, t, sec: +t.slice(0, 2) * 3600 + +t.slice(3) * 60 - now };
    })
    .filter((s) => s.sec >= 0)
    .sort((a, b) => a.sec - b.sec);
