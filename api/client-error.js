// /api/client-error — accepts a JSON error report from the browser, writes
// to public.client_errors. Lib counterpart: lib/error-reporter.js.
//
// Anonymous writes allowed (the error may happen before auth resolves);
// rate-limited by client-side cooldown in the reporter. RLS on the table
// restricts reads to super_admin.
//
// 2026-05-19 — added HIGH-SIGNAL Telegram alert for frontend-↔-DB drift
// (missing RPC / schema cache). Only fires when env vars TELEGRAM_BOT_TOKEN
// + TELEGRAM_ALERT_CHAT_ID are configured. Rate-limited to one alert per
// (signature) per 10 minutes via an in-memory map (edge runtime keeps the
// instance warm for a while; worst case some duplicates slip through —
// still better than DM-flood). DB insert always happens regardless.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

const TG_BOT  = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_ALERT_CHAT_ID || "";

// Patterns that indicate a frontend calling something not deployed to prod
// (the 2026-05-19 P&L failure mode). High-signal: never benign.
const ALERT_PATTERNS = [
  /Could not find the function/i,
  /schema cache/i,
  /PGRST20[26]/i,                    // function not found / not in schema cache
];

// Soft rate limit: in-memory map of signature → last-alert ts. Edge runtime
// reuses the instance across requests until it's evicted (minutes), so this
// catches the common burst pattern. Cold starts let through one alert per
// instance — acceptable.
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const alertSeen = new Map();

async function maybeAlertTelegram(message, viewer, pageUrl) {
  if (!TG_BOT || !TG_CHAT) return;
  if (!ALERT_PATTERNS.some(rx => rx.test(message))) return;

  const sig = message.slice(0, 200);
  const now = Date.now();
  const prev = alertSeen.get(sig) || 0;
  if (now - prev < ALERT_COOLDOWN_MS) return;
  alertSeen.set(sig, now);

  const role = viewer?.role || "unknown";
  const agency = viewer?.agency_id ? String(viewer.agency_id).slice(0, 8) : "?";
  const text =
    "🚨 *RepFlow drift alert*\n" +
    "Frontend hit a missing RPC or schema-cache miss in prod.\n\n" +
    "*Error:* `" + message.slice(0, 400).replace(/`/g, "'") + "`\n" +
    "*Role:* " + role + "  *Agency:* " + agency + "\n" +
    "*Page:* " + (pageUrl || "?").slice(0, 200) + "\n\n" +
    "Likely cause: a feature shipped to repo without its migration being applied to prod. " +
    "Check supabase/migrations/ for an unapplied file, then run apply_migration.";

  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
  } catch { /* swallow — we never want the alert path to break the report */ }
}

const cors = () => ({
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
});

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  // Drop obviously empty reports — browser sometimes fires window.error
  // for cross-origin script failures with no message + no stack.
  if (!body.message && !body.stack) {
    return new Response(JSON.stringify({ ok: true, dropped: "empty" }), { status: 200, headers: cors() });
  }

  const row = {
    message:    String(body.message || "").slice(0, 2000),
    stack:      String(body.stack   || "").slice(0, 8000),
    source:     String(body.source  || "").slice(0, 500),
    line_num:   Number(body.line)   || null,
    column_num: Number(body.column) || null,
    page_url:   String(body.url     || "").slice(0, 500),
    user_agent: String(body.user_agent || "").slice(0, 500),
    viewer:     body.viewer || null,
    kind:       String(body.kind || "error").slice(0, 50),
    occurred_at: body.ts || new Date().toISOString(),
  };

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/client_errors`, {
      method: "POST",
      headers: {
        "apikey": ANON,
        "authorization": `Bearer ${ANON}`,
        "content-type": "application/json",
        "prefer": "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, status: r.status }), { status: 200, headers: cors() });
    }
    // Fire high-signal alert (non-blocking).
    maybeAlertTelegram(row.message, row.viewer, row.page_url).catch(() => {});
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: cors() });
  }
}
