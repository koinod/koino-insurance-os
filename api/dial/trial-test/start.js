// POST /api/dial/trial-test/start — fire a single AI voice test call.
//
// Trial-account safe: uses Twilio's built-in <Say> + <Gather speech> +
// gpt-4o-mini via /api/dial/trial-test/twiml. No SIP trunk, no LiveKit,
// no media streams. Works on a $20-funded Twilio account.
//
// Body: { to: "+1xxxxxxxxxx", repName?: "Ian", scenario?: "losing_leg" }
//
// Cost per call: ~$0.02 (Twilio 90s outbound + ~1k OpenAI tokens).
//
// Twilio will refuse to dial unless `to` is a Verified Caller ID on a
// trial account, OR the account has been upgraded past trial.

import { cors, readUserJwt } from "../../agent/_lib.js";

export const config = { runtime: "edge" };

const TWIML_HOST = "https://repflow.koino.capital";

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return j(401, { error: "not_authenticated" });

  let body; try { body = await req.json(); } catch { body = {}; }
  const to = body.to;
  const repName = body.repName || "Ian";
  const scenario = body.scenario || "losing_leg";
  if (!to) return j(400, { error: "missing_to" });

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_CALLER_ID || "+18449922777";
  if (!sid || !token) return j(500, { error: "twilio_unconfigured" });

  // Pack initial scenario into the TwiML callback URL via query string.
  // Empty history h=, scenario hint, rep name.
  const twimlUrl = `${TWIML_HOST}/api/dial/trial-test/twiml?h=&scen=${encodeURIComponent(scenario)}&rep=${encodeURIComponent(repName)}`;

  const form = new URLSearchParams({
    To: to,
    From: from,
    Url: twimlUrl,
    Method: "POST",
    // Trial-friendly: no AMD (paid), no recording (paid by default), simple Say/Gather only.
    Timeout: "30",
  });

  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const data = await r.json();
  if (!r.ok) {
    return j(r.status, {
      error: "twilio_call_failed",
      code: data.code, message: data.message, more_info: data.more_info,
    });
  }
  return j(200, { ok: true, sid: data.sid, to, from, twiml_callback: twimlUrl });
}

function j(status, obj) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors(), "content-type": "application/json" },
  });
}
