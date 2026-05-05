// /api/connector/test — verify a connector's env vars are wired correctly.
//
// For each connector kind, checks the env vars exist (and where cheap, hits
// the provider's whoami / verify endpoint). Returns:
//   { ok: bool, detail: string, missing_env?: [string] }
//
// Always 200 — the JSON `ok` flag is the source of truth. Lets the UI show
// a green checkmark or a red "missing OPENAI_API_KEY" inline without 4xx
// noise.

export const config = { runtime: "edge" };

const CHECKS = {
  openai: {
    env: ["OPENAI_API_KEY"],
    verify: async () => {
      const r = await fetch("https://api.openai.com/v1/models?limit=1", {
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      return r.ok ? { ok: true, detail: "API key valid" }
                  : { ok: false, detail: `OpenAI ${r.status}` };
    },
  },
  twilio: {
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_TWIML_APP_SID", "TWILIO_CALLER_ID"],
    verify: async () => {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const ks  = process.env.TWILIO_API_KEY_SID;
      const sk  = process.env.TWILIO_API_KEY_SECRET;
      const auth = btoa(`${ks}:${sk}`);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { authorization: `Basic ${auth}` },
      });
      return r.ok ? { ok: true, detail: `Account ${sid.slice(0, 8)}… reachable` }
                  : { ok: false, detail: `Twilio ${r.status}` };
    },
  },
  sendblue: {
    env: ["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET"],
    verify: async () => ({ ok: true, detail: "Credentials present (no whoami endpoint)" }),
  },
  mailgun: {
    env: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN"],
    verify: async () => {
      const auth = btoa(`api:${process.env.MAILGUN_API_KEY}`);
      const r = await fetch(`https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}`, {
        headers: { authorization: `Basic ${auth}` },
      });
      return r.ok ? { ok: true, detail: `Domain ${process.env.MAILGUN_DOMAIN} verified` }
                  : { ok: false, detail: `Mailgun ${r.status}` };
    },
  },
  fathom: {
    env: ["FATHOM_API_TOKEN"],
    verify: async () => ({ ok: true, detail: "Token present" }),
  },
  stripe: {
    env: ["STRIPE_SECRET_KEY"],
    verify: async () => {
      const r = await fetch("https://api.stripe.com/v1/account", {
        headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      });
      return r.ok ? { ok: true, detail: "Stripe account reachable" }
                  : { ok: false, detail: `Stripe ${r.status}` };
    },
  },
  vapi:    { env: ["VAPI_API_KEY"],            verify: async () => ({ ok: true, detail: "Key present" }) },
  ipipe:   { env: ["IPIPE_CLIENT_ID", "IPIPE_CLIENT_SECRET"], verify: async () => ({ ok: true, detail: "Creds present" }) },
  convoso: { env: ["CONVOSO_AUTH_TOKEN"],      verify: async () => ({ ok: true, detail: "Token present" }) },
  trusted: { env: ["TRUSTEDFORM_API_KEY"],     verify: async () => ({ ok: true, detail: "Key present" }) },
  phone_link: { env: [], verify: async () => ({ ok: true, detail: "Local channel — no env required. Pair a phone in OS settings." }) },
};

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const id = (body && body.connector_id) || "";
  const def = CHECKS[id];
  if (!def) {
    return new Response(JSON.stringify({ ok: false, detail: `unknown connector "${id}"` }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const missing = (def.env || []).filter(k => !process.env[k]);
  if (missing.length > 0) {
    return new Response(JSON.stringify({
      ok: false,
      detail: `missing env: ${missing.join(", ")}`,
      missing_env: missing,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  let result;
  try { result = await def.verify(); }
  catch (e) { result = { ok: false, detail: `probe error: ${String(e).slice(0, 120)}` }; }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
