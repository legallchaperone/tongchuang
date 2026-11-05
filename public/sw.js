/* 同窗 service worker (v1.11): shows Web Push notifications sent by the Edge Function `webpush`
   and opens the right page when one is tapped. It does not cache anything. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/** Safari may stop delivering pushes to a site that receives one without showing a notification */
const strictPlatform = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(self.navigator.userAgent);

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "同窗", body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    // the page is open and in front: it already shows its own toast for this
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (!strictPlatform && wins.some((w) => w.focused)) return;
    await self.registration.showNotification(d.title || "同窗", {
      body: d.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if (w.url !== url && "navigate" in w) await w.navigate(url).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
