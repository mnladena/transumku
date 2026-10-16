import { redis } from "./store";

// Only real browser push services: the cron POSTs to whatever endpoint is stored, so an open URL would be SSRF.
const PUSH_HOST =
  /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w-]+\.push\.apple\.com|[\w-]+\.notify\.windows\.com)$/;
const str = (v, max) => (typeof v === "string" && v.length <= max ? v : null);

// Validate at the trust boundary: keep only a well-formed subscription and known fields.
function clean(b) {
  const endpoint = str(b?.sub?.endpoint, 1000),
    p256dh = str(b?.sub?.keys?.p256dh, 200),
    auth = str(b?.sub?.keys?.auth, 100);
  if (!endpoint || !p256dh || !auth) return null;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || !PUSH_HOST.test(u.hostname)) return null;
  } catch {
    return null;
  }
  return {
    sub: { endpoint, keys: { p256dh, auth } },
    arrival: !!b.arrival,
    news: !!b.news,
    alert: !!b.alert,
    halte: str(b.halte, 200),
    halteName: str(b.halteName, 100),
    station: str(b.station, 20),
    stationName: str(b.stationName, 100),
  };
}
const ok = { sub: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "p", auth: "a" } } };
console.assert(
  clean(ok)?.sub.endpoint === ok.sub.endpoint &&
    clean({ sub: { ...ok.sub, endpoint: "https://169.254.169.254/x" } }) === null &&
    clean({ sub: { ...ok.sub, endpoint: "http://fcm.googleapis.com/x" } }) === null,
);

export async function POST(req) {
  const rec = clean(await req.json().catch(() => null));
  if (!rec) return new Response("bad subscription", { status: 400 });
  const old = await redis.hget("subs", rec.sub.endpoint);
  await redis.hset("subs", { [rec.sub.endpoint]: { ...rec, sent: old?.sent ?? [] } });
  return new Response(null, { status: 204 });
}

export async function DELETE(req) {
  const endpoint = str((await req.json().catch(() => null))?.endpoint, 1000);
  if (endpoint) await redis.hdel("subs", endpoint);
  return new Response(null, { status: 204 });
}
