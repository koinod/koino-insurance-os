// /api/automation/dispatch — fan a lead/event out to channel adapters per
// the matching automation_rules. Stamps automation_runs rows; status flips
// to pending_creds when the channel's env vars aren't set.
//
// Body:
//   { trigger_event: 'lead_created' | 'no_contact_24h' | ...,
//     lead_id?: uuid, lead?: { name, phone, email, source, status },
//     rep_id?: text }

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

const CHANNEL_ENV = {
  sms:        ["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_CALLER_ID"],
  imessage:   ["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET"],
  email:      ["MAILGUN_API_KEY", "MAILGUN_DOMAIN"],
  phone_link: [],
};

function jsonResponse(p, s = 200) {
  return new Response(JSON.stringify(p), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function matchesFilter(rule, lead) {
  const f = rule.trigger_filter || {};
  for (const k of Object.keys(f)) {
    if (lead[k] !== f[k]) return false;
  }
  return true;
}

async function pickChannel(channels) {
  for (const c of channels || []) {
    const required = CHANNEL_ENV[c] || [];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length === 0) return { channel: c, missing: [] };
  }
  // Nothing fully configured — return the first preferred channel and its missing creds.
  const first = (channels && channels[0]) || "sms";
  return { channel: first, missing: CHANNEL_ENV[first] || [] };
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  let body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad json" }, 400); }
  const { trigger_event, lead_id, lead = {}, rep_id } = body || {};
  if (!trigger_event) return jsonResponse({ error: "trigger_event required" }, 400);

  const auth = req.headers.get("authorization") || "";
  const jwt  = auth.replace(/^Bearer\s+/i, "") || ANON;

  // Resolve viewer agency.
  const meR = await fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: "{}",
  });
  const meRows = meR.ok ? await meR.json() : [];
  const me = (Array.isArray(meRows) && meRows[0]) || null;
  const agencyId = (me && me.agency_id) || "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9";

  // Pull active rules for this trigger.
  const rulesR = await fetch(
    `${SUPA_URL}/rest/v1/automation_rules?agency_id=eq.${agencyId}&trigger_event=eq.${trigger_event}&active=eq.true`,
    { headers: { apikey: ANON, authorization: `Bearer ${jwt}` } }
  );
  const rules = rulesR.ok ? await rulesR.json() : [];
  const matched = rules.filter(r => matchesFilter(r, lead));

  const runs = [];
  for (const rule of matched) {
    const { channel, missing } = await pickChannel(rule.channels);
    const status = missing.length === 0 ? "scheduled" : "pending_creds";
    const failureDetail = missing.length === 0 ? null : `missing env: ${missing.join(", ")}`;
    const recipient = (channel === "email" ? lead.email : lead.phone) || null;

    let body_snapshot = null;
    if (rule.template_id) {
      const tR = await fetch(
        `${SUPA_URL}/rest/v1/followup_templates?id=eq.${rule.template_id}&select=body`,
        { headers: { apikey: ANON, authorization: `Bearer ${jwt}` } }
      );
      const tRows = tR.ok ? await tR.json() : [];
      body_snapshot = (tRows[0] || {}).body || null;
    }

    const insertR = await fetch(`${SUPA_URL}/rest/v1/automation_runs`, {
      method: "POST",
      headers: {
        apikey: ANON,
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        rule_id: rule.id,
        agency_id: agencyId,
        rep_id: rep_id || (me && me.rep_id) || null,
        lead_id: lead_id || null,
        channel,
        recipient,
        body_snapshot,
        status,
        failure_detail: failureDetail,
      }),
    });
    if (insertR.ok) {
      const inserted = (await insertR.json())[0];
      runs.push(inserted);
    }
  }

  return jsonResponse({
    matched: matched.length,
    runs: runs.map(r => ({
      id: r.id, rule_id: r.rule_id, channel: r.channel,
      status: r.status, scheduled_for: r.scheduled_for,
      failure_detail: r.failure_detail,
    })),
  });
}
