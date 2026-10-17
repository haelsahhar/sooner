// Minimal service worker: makes the site installable. Pages always come from the network
// (availability must be fresh); if offline, show a short message instead of a browser error.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(
    fetch(e.request).catch(
      () =>
        new Response(
          "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#F7F6F2;color:#13201E'><p>You're offline. Reconnect to see the latest appointments.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});
