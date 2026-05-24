// GET/POST /api/dial/trial-test/twiml — TwiML callback for the trial AI voice
// test. Stateless: conversation history travels in the ?h= query param as
// base64-encoded JSON.
//
// Flow per turn:
//   1. Twilio POSTs (with SpeechResult on subsequent turns)
//   2. We decode history, append the lead's last utterance
//   3. Call OpenAI gpt-4o-mini for the next assistant turn
//   4. Append to history, re-encode, embed in next Gather action URL
//   5. Return <Say>{assistant}</Say> + <Gather input="speech" action="?h=NEW">
//
// Conversation ends after ~5 turns or when the model emits END_CALL, or
// when Twilio times out the gather.

import { cors } from "../../agent/_lib.js";

export const config = { runtime: "edge" };

const HOST = "https://repflow.koino.capital";

const SYSTEM_PROMPT = ({ repName, scenario }) => `\
You are Koino Capital Insurance Agency's AI assistant on a phone call.
${scenario === "losing_leg" ? `${repName} placed the call but stepped away — you're filling in.` : ""}

Rules:
- Identify yourself as "Koino Capital's AI assistant" — never pretend to be a human.
- If asked "are you a person/AI/real" → answer plainly "I'm an AI assistant."
- Keep replies SHORT — one or two sentences max, ≤25 words.
- Confirm whether this is a good time, gauge interest in insurance products
  (life, Med Supp, final expense, business), and offer to schedule via
  cal.com/koino if they want a real agent callback.
- After 4–5 exchanges total, wrap up the call. Append the literal token END_CALL
  to your final reply when you're ready to hang up.
- If they say "stop calling" or "not interested" — apologize, offer to remove
  them from the list, then END_CALL.

Be warm, brief, and useful. Never quote prices or bind coverage.`;

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const url = new URL(req.url);
  const histB64 = url.searchParams.get("h") || "";
  const scenario = url.searchParams.get("scen") || "losing_leg";
  const repName = url.searchParams.get("rep") || "Ian";

  let history = [];
  if (histB64) {
    try { history = JSON.parse(atob(histB64)); }
    catch { history = []; }
  }

  // First turn: no SpeechResult. Generate opener.
  // Later turns: pull SpeechResult from form body, append as user message.
  let userText = "";
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const raw = await req.text();
      const params = new URLSearchParams(raw);
      userText = (params.get("SpeechResult") || "").trim();
    }
  }
  if (userText) history.push({ role: "user", content: userText });

  // Ask OpenAI for the next turn.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return xml(makeHangup("OpenAI not configured. Goodbye."));

  let assistant;
  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT({ repName, scenario }) },
      ...history,
    ];
    // If this is the opener, give the model a nudge.
    if (history.length === 0) {
      messages.push({ role: "user", content: "[Lead just answered the phone — start the conversation.]" });
    }
    const aiR = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 80,
        temperature: 0.6,
        messages,
      }),
    });
    const aiJ = await aiR.json();
    assistant = aiJ.choices?.[0]?.message?.content?.trim() || "Sorry, I lost my train of thought. Goodbye.";
  } catch (e) {
    return xml(makeHangup(`Connection error. Goodbye.`));
  }

  history.push({ role: "assistant", content: assistant });

  // Detect end-of-call token.
  const endCall = /END_CALL/i.test(assistant);
  const sayText = assistant.replace(/END_CALL/gi, "").trim() || "Thanks, goodbye.";

  // Cap conversation length (safety belt).
  if (history.length >= 12 || endCall) {
    return xml(makeHangup(sayText));
  }

  const newH = btoa(JSON.stringify(history));
  const next = `${HOST}/api/dial/trial-test/twiml?h=${encodeURIComponent(newH)}&scen=${encodeURIComponent(scenario)}&rep=${encodeURIComponent(repName)}`;

  // Voice + Polly choice — Polly.Joanna sounds passable on US/CA carriers.
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(sayText)}</Say>
  <Gather input="speech" speechTimeout="auto" timeout="6" action="${escapeXml(next)}" method="POST">
    <Say voice="Polly.Joanna">Are you there?</Say>
  </Gather>
  <Say voice="Polly.Joanna">Okay, talk to you soon.</Say>
  <Hangup/>
</Response>`;
  return xml(body);
}

function makeHangup(text) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

function xml(body) {
  return new Response(body, {
    status: 200,
    headers: { ...cors(), "content-type": "text/xml; charset=utf-8" },
  });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
