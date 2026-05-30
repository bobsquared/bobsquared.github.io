/*
 * Custom COI service worker — injects COOP/COEP headers so SharedArrayBuffer
 * is available on GitHub Pages and mobile browsers.
 *
 * Skips non-HTTP(S) requests (blob:, data:, chrome-extension:, etc.) so that
 * Emscripten's pthread worker blob URLs are never intercepted.
 */

if (typeof window === "undefined") {
  // ── Service Worker context ────────────────────────────────────────────────
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", e => {
    const url = e.request.url;

    // Only intercept plain http(s) requests — leave blob:, data:, etc. alone
    if (!url.startsWith("http")) return;

    // "only-if-cached" + not same-origin would throw — skip it
    if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;

    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Opaque responses (status 0) can't have headers mutated — pass through
          if (response.status === 0) return response;

          const headers = new Headers(response.headers);
          headers.set("Cross-Origin-Opener-Policy",   "same-origin");
          headers.set("Cross-Origin-Embedder-Policy", "require-corp");
          headers.set("Cross-Origin-Resource-Policy", "cross-origin");

          return new Response(response.body, {
            status:     response.status,
            statusText: response.statusText,
            headers,
          });
        })
        .catch(err => {
          console.error("[coi-sw] fetch error:", err, url);
          // Return a proper error response instead of undefined
          return new Response("Service worker fetch error", { status: 500 });
        })
    );
  });

} else {
  // ── Main thread context ───────────────────────────────────────────────────
  (() => {
    if (window.crossOriginIsolated) return; // already isolated, nothing to do
    if (!window.isSecureContext)    return; // service workers require HTTPS
    if (!navigator.serviceWorker)  return;

    navigator.serviceWorker
      .register(document.currentScript.src)
      .then(reg => {
        console.log("[coi-sw] registered, scope:", reg.scope);

        // If the SW just activated but isn't controlling yet, reload once
        if (reg.active && !navigator.serviceWorker.controller) {
          console.log("[coi-sw] reloading to activate…");
          window.location.reload();
        }

        // Reload when a new version of this SW is found
        reg.addEventListener("updatefound", () => {
          console.log("[coi-sw] update found — reloading…");
          window.location.reload();
        });
      })
      .catch(err => console.error("[coi-sw] registration failed:", err));
  })();
}
