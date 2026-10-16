"use client";
import { useEffect, useRef, useState } from "react";
import { GEAR, Ico } from "./icons";

// Per-device preferences, so localStorage is enough.
const load = () => {
  try {
    return JSON.parse(localStorage.settings || "{}");
  } catch {
    return {};
  }
};
export const on = (k) => !!load()[k];

// ponytail: browsers start an AudioContext suspended without a user gesture, so after a reload
// the beep may stay silent until the page is tapped; vibration still works.
let audio;
function beep() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(),
      g = audio.createGain(),
      t = audio.currentTime;
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(t + 0.4);
  } catch {}
}

// System notification when allowed, plus beep + vibrate when the alert setting is on.
export async function notify(title, body, tag) {
  const alert = on("alert");
  if (alert) {
    navigator.vibrate?.([200, 100, 200]);
    beep();
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  // `vibrate` together with `silent: true` throws, so only pass it when alerting.
  const opts = { body, tag, icon: "/icon/192", silent: !alert, ...(alert && { vibrate: [200, 100, 200] }) };
  const reg = await navigator.serviceWorker?.getRegistration();
  reg ? reg.showNotification(title, opts) : new Notification(title, opts);
}

const ITEMS = [
  ["arrival", "Kedatangan terdekat", "Notifikasi saat bus/kereta terdekat dari lokasimu tiba ≤ 2 menit. Nyalakan “Lokasi saya” di peta TransJakarta.", true],
  ["alert", "Suara & getar", "Bunyi dan getar setiap ada notifikasi.", false],
  ["news", "Gangguan & pengumuman", "Notifikasi info gangguan atau pengumuman seputar transum.", true],
  ["push", "Saat aplikasi tertutup", "Kedatangan & pengumuman tetap dikirim walau aplikasi ditutup, untuk halte/stasiun terdekat terakhir dari “Lokasi saya”.", true],
];

const pushKey = (b64) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const pushSub = async () => (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();

// Send current prefs + watched stops to the push server (no-op unless push is on).
export async function syncPush() {
  const s = load(),
    sub = s.push && (await pushSub());
  if (!sub) return;
  let stops = {};
  try {
    stops = JSON.parse(localStorage.pushStops || "{}");
  } catch {}
  await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sub, arrival: s.arrival, news: s.news, alert: s.alert, ...stops }),
  }).catch(() => {});
}

async function setPush(val) {
  if (!val) {
    const sub = await pushSub();
    if (!sub) return;
    await fetch("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
    return sub.unsubscribe();
  }
  if (!("PushManager" in window)) throw new Error("browser ini tidak mendukung push (iPhone: tambahkan ke Home Screen dulu)");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) });
}

export default function Settings() {
  const ref = useRef();
  const [s, setS] = useState({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setS(load());
    navigator.serviceWorker?.register("/sw.js");
    // <details> doesn't close on outside click by itself.
    const close = (e) => ref.current && !ref.current.contains(e.target) && ref.current.removeAttribute("open");
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Announcements come from public/announcements.json ([{id, title, body}]): edit and redeploy to publish.
  // With push on, the server sends them instead.
  useEffect(() => {
    if (!s.news || s.push) return;
    const check = () =>
      fetch("/announcements.json", { cache: "no-store" })
        .then((r) => r.json())
        .then((list) => {
          const seen = new Set(JSON.parse(localStorage.seenNews || "[]"));
          for (const a of list.filter((a) => !seen.has(a.id))) {
            notify(a.title, a.body, "news-" + a.id);
            seen.add(a.id);
          }
          localStorage.seenNews = JSON.stringify([...seen]);
        })
        .catch(() => {});
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [s.news, s.push]);

  const toggle = async (k, needsPermission, val) => {
    if (val && needsPermission) {
      if (typeof Notification === "undefined") return setMsg("Browser ini tidak mendukung notifikasi.");
      if ((await Notification.requestPermission()) !== "granted")
        return setMsg("Izin notifikasi ditolak. Aktifkan di pengaturan browser.");
    }
    if (k === "push") {
      try {
        await setPush(val);
      } catch (e) {
        return setMsg("Push gagal: " + e.message);
      }
    }
    const next = { ...s, [k]: val };
    localStorage.settings = JSON.stringify(next);
    setS(next);
    setMsg("");
    syncPush();
    if (k === "alert" && val) {
      beep(); // preview, and unlocks audio while we have a user gesture
      navigator.vibrate?.(200);
    }
  };

  return (
    <details className="settings" ref={ref}>
      <summary aria-label="Pengaturan" title="Pengaturan">
        <Ico svg={GEAR} />
      </summary>
      <div className="settings-panel">
        <b>Pengaturan</b>
        {ITEMS.map(([k, title, desc, perm]) => (
          <label key={k} className="toggle">
            <span>
              <b>{title}</b>
              <small className="mute">{desc}</small>
            </span>
            <input type="checkbox" role="switch" checked={!!s[k]} onChange={(e) => toggle(k, perm, e.target.checked)} />
          </label>
        ))}
        {msg && <p className="mute">{msg}</p>}
      </div>
    </details>
  );
}
