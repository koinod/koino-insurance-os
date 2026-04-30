// api/copilot.js — Vercel serverless function backing the AI co-pilot rail.
// Proxies to Google Gemini using the server-side GEMINI_API_KEY (or
// GOOGLE_AI_KEY) env var. Receives {prompt, context} JSON, returns
// {text, ms, model} JSON.

export const config = { runtime: "edge" };

const SYSTEM = `You are Repflow's in-app co-pilot for an insurance distribution operator (IMO/agency owner running life & health producers). You see the operator's current page context and answer concisely with operator-grade specificity. Money is always in plain numbers (e.g., $42,310). State actionable findings in 1-3 short paragraphs or a short list. If you'd need to call a tool that doesn't exist (real DB query, carrier API, etc.), say so and propose the closest answer from the context provided.`;

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" }});
  }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY (or GOOGLE_AI_KEY) not set on Vercel project" }), { status: 500, headers: { "content-type": "application/json" }});
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { "content-type": "application/json" }}); }
  const { prompt, context } = body || {};
  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "prompt required" }), { status: 400, headers: { "content-type": "application/json" }});
  }

  const userMsg = `${SYSTEM}\n\n[Page context: ${context || "(none)"}]\n\n${prompt}`;
  const t0 = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 600 }
      })
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "model fetch failed", detail: String(err) }), { status: 502, headers: { "content-type": "application/json" }});
  }

  if (!resp.ok) {
    const detail = await resp.text();
    return new Response(JSON.stringify({ error: "model returned " + resp.status, detail }), { status: 502, headers: { "content-type": "application/json" }});
  }

  const j = await resp.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || "(empty response)";
  const ms = Date.now() - t0;

  return new Response(JSON.stringify({ text, ms, model: "gemini-2.0-flash" }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
