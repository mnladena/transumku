// Minimal service worker: shows notifications (Android needs one) and receives Web Push. No caching.
self.addEventListener("push", (e) => {
  const m = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(m.title || "Transumku", {
      body: m.body,
      tag: m.tag,
      icon: "/icon/192",
      silent: !m.alert,
      // `vibrate` together with `silent: true` throws, so only pass it when alerting.
      ...(m.alert && { vibrate: [200, 100, 200] }),
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((ws) => (ws[0] ? ws[0].focus() : clients.openWindow("/"))),
  );
});
