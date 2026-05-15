// Client-side error reporter. Loads first in <head> so it catches errors
// from ALL subsequent scripts (including React mount-time crashes that
// would otherwise leave the screen blank). Posts to /api/client-error which
// writes a row to public.client_errors — you can grep that table for fresh
// crashes instead of waiting for users to surface them.
//
// Captured channels:
//   1. window.onerror              — synchronous script errors
//   2. unhandledrejection          — async errors (await/promise chains)
//   3. window.reportClientError(e) — manual hook for React error boundaries
//
// Throttled to one POST per (message, stack-head) per minute so a render
// loop doesn't DDOS the endpoint.

(function () {
  if (typeof window === "undefined") return;
  if (window.__errorReporterInstalled) return;
  window.__errorReporterInstalled = true;

  const ENDPOINT = "/api/client-error";
  const seen = new Map(); // key → ts
  const COOLDOWN_MS = 60_000;

  function shouldSend(key) {
    const now = Date.now();
    const prev = seen.get(key) || 0;
    if (now - prev < COOLDOWN_MS) return false;
    seen.set(key, now);
    return true;
  }

  function send(payload) {
    const key = (payload.message || "?") + "::" + (payload.stack || "?").split("\n")[0];
    if (!shouldSend(key)) return;
    try {
      const body = JSON.stringify({
        message:   String(payload.message || "").slice(0, 2000),
        stack:     String(payload.stack || "").slice(0, 8000),
        source:    String(payload.source || "").slice(0, 500),
        line:      Number(payload.line) || null,
        column:    Number(payload.column) || null,
        url:       location.href.slice(0, 500),
        user_agent: navigator.userAgent.slice(0, 500),
        viewer:    (window.me && window.me()) ? {
          rep_id:    (window.me() || {}).rep_id || null,
          agency_id: (window.me() || {}).agency_id || null,
          role:      (window.me() || {}).role || null,
        } : null,
        kind:      payload.kind || "error",
        ts:        new Date().toISOString(),
      });
      // sendBeacon is the right tool — fire-and-forget, survives unload,
      // browser handles it on a background thread. Falls back to fetch
      // (keepalive) in case sendBeacon is blocked.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch {}
  }

  window.addEventListener("error", function (e) {
    send({
      message: e.message || String(e.error || ""),
      stack:   e.error && e.error.stack ? e.error.stack : "",
      source:  e.filename || "",
      line:    e.lineno,
      column:  e.colno,
      kind:    "error",
    });
  });

  window.addEventListener("unhandledrejection", function (e) {
    const r = e.reason || {};
    send({
      message: typeof r === "string" ? r : (r.message || JSON.stringify(r).slice(0, 1000)),
      stack:   r.stack || "",
      kind:    "unhandledrejection",
    });
  });

  // Manual hook — call from React error boundary's componentDidCatch.
  window.reportClientError = function (err, info) {
    send({
      message: (err && err.message) || String(err),
      stack:   (err && err.stack) || "",
      source:  (info && info.componentStack) || "",
      kind:    "react-boundary",
    });
  };
})();
