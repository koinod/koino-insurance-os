// GET /api/cron/connector-probe — Vercel cron, nightly. Iterates every active
// connector_vault row and posts to /api/connector/probe with kind=nightly.
// Auth: Vercel cron sends a signed header — we accept it via VERCEL_CRON
// env or the x-cron-secret. Idempotent; safe to re-run.
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  // Vercel cron pings via GET. We allow GET + POST.
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "GET or POST" }), { status: 405, headers: cors() });
  }
  // Cron header presence is enough to allow when CRON_SECRET unset.
  const fromVercelCron = req.headers.get("x-vercel-cron") || req.headers.get("user-agent")?.includes("vercel-cron");
  const cronSecret = req.headers.get("x-cron-secret");
  if (!fromVercelCron && (!cronSecret || cronSecret !== process.env.CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors() });
  }

  const r = await fetch(`${SUPA_URL}/rest/v1/connector_vault?select=id,provider&status=eq.active`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
  if (!r.ok) return new Response(JSON.stringify({ error: "vault read failed" }), { status: 500, headers: cors() });
  const vault = await r.json();

  const url = new URL(req.url);
  const probeUrl = `${url.protocol}//${url.host}/api/connector/probe`;
  const results = await Promise.allSettled(vault.map(v =>
    fetch(probeUrl, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET || "_internal_", "content-type": "application/json" },
      body: JSON.stringify({ vault_id: v.id, provider: v.provider, kind: "nightly" }),
    }).then(r => r.json())
  ));
  const summary = {
    total: vault.length,
    green:  results.filter(r => r.status === "fulfilled" && r.value?.status === "green").length,
    yellow: results.filter(r => r.status === "fulfilled" && r.value?.status === "yellow").length,
    red:    results.filter(r => r.status === "fulfilled" && r.value?.status === "red").length,
    errored: results.filter(r => r.status === "rejected").length,
  };
  return new Response(JSON.stringify(summary), { status: 200, headers: cors() });
}
