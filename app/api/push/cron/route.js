import webpush from "web-push";
import news from "../../../../public/announcements.json";
import trips from "../../../../public/tj.json";
import { buildHalte, nextBuses, nextTrains } from "../../../transit";
import { redis } from "../store";

// Alert for anything due within 5 min: wide enough that a 1–5 min cron never skips a vehicle.
const WINDOW = 5 * 60;
const halte = buildHalte(trips); // once per cold start
const when = (s) => (s < 60 ? "Sekarang" : `~${Math.round(s / 60)} menit lagi`);

// Called every minute by a cron with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this itself).
// ponytail: walks every subscriber each run; shard or queue once there are thousands.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("unauthorized", { status: 401 });
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  // Server clock is UTC; schedules are WIB (UTC+7, no DST).
  const d = new Date(Date.now() + 7 * 3600e3),
    now = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(),
    day = (d.getUTCDay() + 6) % 7;
  const krl = {}; // station id -> schedule, fetched once per run
  const subs = Object.values((await redis.hgetall("subs")) ?? {});
  let pushed = 0;

  await Promise.all(
    subs.map(async (rec) => {
      const msgs = [];
      if (rec.news) for (const a of news) msgs.push({ key: "news-" + a.id, title: a.title, body: a.body });
      if (rec.arrival) {
        const h = rec.halte && halte.get(rec.halte);
        if (h)
          for (const { t, s } of nextBuses(h, now, day))
            if (s <= WINDOW)
              msgs.push({
                key: `${h.key}|${t.r}|${t.h}|${Math.round((now + s) / 60)}`,
                title: `Bus ${t.r} → ${t.h}`,
                body: `${when(s)} di ${h.name}`,
              });
        if (rec.station) {
          krl[rec.station] ??= fetch("https://api.comuline.com/v1/schedule/" + encodeURIComponent(rec.station))
            .then((r) => r.json())
            .then((j) => j.data ?? [])
            .catch(() => []);
          for (const s of nextTrains(await krl[rec.station], now))
            if (s.sec <= WINDOW)
              msgs.push({
                key: `${rec.station}|${s.train_id}|${s.t}`,
                title: `Kereta ${s.train_id} → ${s.route.split("-").pop()}`,
                body: `${when(s.sec)} dari ${rec.stationName}`,
              });
        }
      }

      const sent = new Set(rec.sent);
      const fresh = msgs.filter((m) => !sent.has(m.key));
      if (!fresh.length) return;
      try {
        for (const m of fresh) {
          await webpush.sendNotification(rec.sub, JSON.stringify({ title: m.title, body: m.body, tag: m.key, alert: rec.alert }));
          sent.add(m.key);
          pushed++;
        }
      } catch (e) {
        // Browser dropped the subscription (uninstalled, permission revoked): forget it.
        if (e.statusCode === 404 || e.statusCode === 410) return redis.hdel("subs", rec.sub.endpoint);
      }
      await redis.hset("subs", { [rec.sub.endpoint]: { ...rec, sent: [...sent].slice(-200) } });
    }),
  );

  return Response.json({ subs: subs.length, pushed });
}
