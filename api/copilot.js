// api/copilot.js — Vercel Edge function backing the AI co-pilot rail.
//
// Cascade: Gemini 2.0 Flash → Gemini 1.5 Flash → OpenRouter (Claude Haiku).
// First two share Google quota; OpenRouter is paid fallback. Returns
// {text, ms, model, fallback?} JSON.

export const config = { runtime: "edge" };

const SYSTEM = `You are Repflow's in-app co-pilot for an insurance distribution operator (IMO/agency owner running life & health producers). You see the operator's current page context and answer concisely with operator-grade specificity. Money is always in plain numbers (e.g., $42,310). State actionable findings in 1-3 short paragraphs or a short list. If you'd need a tool that doesn't exist (real DB query, carrier API, etc.), say so and propose the closest answer from the context provided.`;

async function tryGemini(model, key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 600 }
    })
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return { ok: false, status: resp.status, detail };
  }
  const j = await resp.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || "";
  return { ok: true, text };
}

async function tryOpenRouter(key, prompt) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${key}`,
      "http-referer": "https://koino-insurance-os.vercel.app",
      "x-title": "Repflow"
    },
    body: JSON.stringify({
      model: "anthropic/claude-3-haiku",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 600
    })
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return { ok: false, status: resp.status, detail };
  }
  const j = await resp.json();
  const text = j?.choices?.[0]?.message?.content || "";
  return { ok: true, text };
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" }});
  }

  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!gKey && !orKey) {
    return new Response(JSON.stringify({ error: "no AI keys set on Vercel project" }), { status: 500, headers: { "content-type": "application/json" }});
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { "content-type": "application/json" }}); }
  const { prompt, context } = body || {};
  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "prompt required" }), { status: 400, headers: { "content-type": "application/json" }});
  }

  const userMsg = `${SYSTEM}\n\n[Page context: ${context || "(none)"}]\n\n${prompt}`;
  const t0 = Date.now();
  const attempts = [];

  // 1. Gemini 2.0 Flash
  if (gKey) {
    const r = await tryGemini("gemini-2.0-flash", gKey, userMsg);
    if (r.ok && r.text) return new Response(JSON.stringify({ text: r.text, ms: Date.now() - t0, model: "gemini-2.0-flash" }), { status: 200, headers: { "content-type": "application/json" }});
    attempts.push({ provider: "gemini-2.0-flash", status: r.status, detail: r.detail?.slice(0, 200) });
  }

  // 2. Gemini 1.5 Flash (different quota)
  if (gKey) {
    const r = await tryGemini("gemini-1.5-flash", gKey, userMsg);
    if (r.ok && r.text) return new Response(JSON.stringify({ text: r.text, ms: Date.now() - t0, model: "gemini-1.5-flash", fallback: true }), { status: 200, headers: { "content-type": "application/json" }});
    attempts.push({ provider: "gemini-1.5-flash", status: r.status, detail: r.detail?.slice(0, 200) });
  }

  // 3. OpenRouter (paid fallback — Claude Haiku)
  if (orKey) {
    const r = await tryOpenRouter(orKey, userMsg);
    if (r.ok && r.text) return new Response(JSON.stringify({ text: r.text, ms: Date.now() - t0, model: "claude-3-haiku-via-openrouter", fallback: true }), { status: 200, headers: { "content-type": "application/json" }});
    attempts.push({ provider: "openrouter", status: r.status, detail: r.detail?.slice(0, 200) });
  }

  return new Response(JSON.stringify({ error: "all providers failed", attempts }), {
    status: 502,
    headers: { "content-type": "application/json" }
  });
}
