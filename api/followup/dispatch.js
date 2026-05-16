// /api/followup/dispatch — schedule a follow-up text from a template.
//
// Plumbing:
//   - Loads the template via PostgREST
//   - Creates a followup_runs row stamped with `pending_creds` if the
//     channel adapter env vars are missing, else `scheduled`
//   - Returns { run } so the client can show its state immediately
//
// We don't actually send here — a separate cron/worker will pick up
// scheduled runs and call out to Twilio / SendBlue / SMTP. Until that
// worker exists, scheduled-but-never-sent runs are visible in the
// follow-ups history with their pending_creds reason, so the operator
// can debug.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

const CHANNEL_ENV = {
  sms:        ["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET"],
  imessage:   ["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET"],
  email:      ["MAILGUN_API_KEY", "MAILGUN_DOMAIN"],
  phone_link: [], // local-host channel — no creds needed
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad json" }, 400); }
  body = body || {};
  if (typeof body.template_id !== "string" || body.template_id.length === 0 || body.template_id.length > 64) {
    return jsonResponse({ error: "template_id must be a non-empty string ≤ 64 chars" }, 400);
  }
  for (const k of ["recipient","lead_id","rep_id"]) {
    if (body[k] != null && (typeof body[k] !== "string" || body[k].length > 320)) {
      return jsonResponse({ error: `${k} must be a string ≤ 320 chars` }, 400);
    }
  }
  const { template_id, recipient, lead_id, rep_id } = body;

  const auth = req.headers.get("authorization") || "";
  const jwt  = auth.replace(/^Bearer\s+/i, "") || ANON;

  // Pull the template + viewer agency_id in one round-trip via the me() RPC
  // and a templates select.
  const [meR, tR] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
      method: "POST",
      headers: { apikey: ANON, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: "{}",
    }),
    fetch(`${SUPA_URL}/rest/v1/followup_templates?id=eq.${template_id}&select=*`, {
      headers: { apikey: ANON, authorization: `Bearer ${jwt}` },
    }),
  ]);

  let me = null;
  try { const rows = await meR.json(); me = Array.isArray(rows) && rows[0]; } catch {}
  let tmpl = null;
  try { const rows = await tR.json(); tmpl = Array.isArray(rows) && rows[0]; } catch {}
  if (!tmpl) return jsonResponse({ error: "template not found" }, 404);

  const channel = tmpl.channel || "sms";
  const required = CHANNEL_ENV[channel] || [];
  const missing = required.filter(k => !process.env[k]);
  const status = missing.length === 0 ? "scheduled" : "pending_creds";
  const failureDetail = missing.length === 0 ? null : `missing env: ${missing.join(", ")}`;
  const scheduledFor = new Date(Date.now() + (tmpl.delay_minutes || 0) * 60 * 1000).toISOString();

  const agencyId = me && me.agency_id;
  if (!agencyId) return jsonResponse({ error: "no agency in session" }, 401);

  const run = {
    template_id,
    rep_id: rep_id || (me && me.rep_id) || null,
    lead_id: lead_id || null,
    agency_id: agencyId,
    scheduled_for: scheduledFor,
    status,
    channel,
    recipient: recipient || null,
    body_snapshot: tmpl.body,
    failure_detail: failureDetail,
  };

  const insertR = await fetch(`${SUPA_URL}/rest/v1/followup_runs`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(run),
  });
  if (!insertR.ok) {
    const detail = await insertR.text();
    return jsonResponse({ error: "insert failed", detail }, 502);
  }
  const inserted = (await insertR.json())[0] || run;

  return jsonResponse({
    run: {
      id: inserted.id,
      status: inserted.status,
      scheduledFor: inserted.scheduled_for,
      channel: inserted.channel,
      pendingCreds: status === "pending_creds",
      missingEnv: missing,
    },
  });
}
