// api/copilot.js — Vercel Edge function backing the AI co-pilot rail.
//
// Cascade: Gemini 2.0 Flash → Gemini 1.5 Flash → OpenRouter (Claude Haiku).
// Tool-calls: before asking the model, the fn inspects the prompt + context
// for data questions and runs Supabase queries via the public PostgREST API.
// Results are inlined into the model prompt as JSON.

export const config = { runtime: "edge" };

const SYSTEM = `You are Repflow's in-app co-pilot for an insurance distribution operator (IMO/agency owner running life & health producers). You see the operator's current page context PLUS any DATA the runtime fetched on your behalf, and answer concisely with operator-grade specificity.

Rules:
- Money is always in plain numbers (e.g., $42,310). MTD AP is annualized premium for the month-to-date.
- State actionable findings in 1-3 short paragraphs or a short list.
- If DATA is provided, ground every claim in those rows. Cite rep/lead names and exact numbers.
- If DATA wasn't fetched (free-form question), say what you'd need a tool for and propose the closest answer from the page context.
- Never invent rep names, AP, or stages. If unsure, say so.`;

const SUPA_URL = "https://zybndnqnbxarpkhqpcxq.supabase.co";

/* ─── Data tools ──────────────────────────────────────────────────────────
   Each tool returns a {label, rows} shape that gets serialized to JSON
   and inlined into the model prompt. Selection rule: scan the prompt for
   keywords; run the matching tools (up to 3 at once for cost control).
   ─────────────────────────────────────────────────────────────────────── */
async function sbSelect(path, anonKey, userJwt) {
  // If the caller forwarded a user JWT, use it (RLS authenticated policies kick in).
  // Otherwise fall back to anon (which won't see anything under tightened RLS — that's fine).
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { "apikey": anonKey, "authorization": `Bearer ${userJwt || anonKey}` }
  });
  if (!r.ok) return null;
  return await r.json();
}

const TOOLS = {
  reps: {
    match: /\b(rep|reps|producer|producers|leaderboard|tier|tiers|tony|marcus|dani|kira|jada|sade|luis|remy|alex)\b/i,
    label: "REPS · all producers, sorted by MTD",
    fetch: (anon, jwt) => sbSelect("reps?select=id,name,handle,tier,mtd_cents,today_cents,streak_days,dials,presence,appts&order=mtd_cents.desc", anon, jwt),
  },
  pipeline: {
    match: /\b(pipeline|deal|deals|lead|leads|stage|stages|app in|quoted|issued|stuck|hot|cold|aging|days)\b/i,
    label: "PIPELINE · 15 most stagnant leads with rep/stage/heat",
    fetch: (anon, jwt) => sbSelect("pipeline?select=lead_name,age,state,stage,product,ap_cents,days_in_stage,heat,owner_rep_id,source,last_activity_text,next_action&order=days_in_stage.desc&limit=15", anon, jwt),
  },
  queue: {
    match: /\b(queue|inbound|sla|dispatch|speed-to-lead|dial|dialing)\b/i,
    label: "QUEUE · current inbound dial queue",
    fetch: (anon, jwt) => sbSelect("queue?select=lead_name,age,state,source,product,elapsed_seconds,score&order=score.desc&limit=15", anon, jwt),
  },
  recordings: {
    match: /\b(call|calls|recording|coaching|talk|talk ratio|tpmo|soa|transcript)\b/i,
    label: "RECORDINGS · last 5 calls scored",
    fetch: (anon, jwt) => sbSelect("recordings?select=lead_name,rep_id,duration_sec,talk_ratio_pct,open_questions,ai_summary,tpmo_flag,soa_flag,score,recorded_at&order=recorded_at.desc&limit=5", anon, jwt),
  },
  hardware: {
    match: /\b(host|hardware|vps|mac mini|node|nodes|enrolled|fleet)\b/i,
    label: "HARDWARE · enrolled hosts",
    fetch: (anon, jwt) => sbSelect("hardware?select=id,name,kind,status,uptime_text,load_pct,agent_count,last_heartbeat&order=last_heartbeat.desc", anon, jwt),
  },
  agents: {
    match: /\b(agent|agents|automation|workflow|workflows|bot|bots)\b/i,
    label: "AI_AGENTS · deployed agent templates",
    fetch: (anon, jwt) => sbSelect("ai_agents?select=id,name,host_id,reqs_per_day,success_rate,description", anon, jwt),
  },
  connections: {
    match: /\b(connection|connections|integration|integrations|carrier|carriers|twilio|vapi|stripe|jornaya)\b/i,
    label: "CONNECTIONS · third-party services",
    fetch: (anon, jwt) => sbSelect("connections?select=id,name,category,status,meta", anon, jwt),
  },
  enrollments: {
    match: /\b(sequence|sequences|enrollment|cadence|follow-up|nurture|drip)\b/i,
    label: "SEQUENCE_ENROLLMENTS · active enrollments",
    fetch: (anon, jwt) => sbSelect("sequence_enrollments?select=lead_pipeline_id,sequence_id,owner_rep_id,status,current_step,enrolled_at&status=eq.active&order=enrolled_at.desc&limit=20", anon, jwt),
  },
};

function pickTools(prompt, context) {
  const hay = `${prompt}\n${context || ""}`.toLowerCase();
  const scored = Object.entries(TOOLS)
    .map(([name, t]) => [name, t, t.match.test(hay) ? 1 : 0])
    .filter(([, , s]) => s > 0);
  // Cap at 3 tools per call to keep token budget small
  return scored.slice(0, 3).map(([name, t]) => ({ name, t }));
}

async function fetchData(prompt, context, userJwt) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W";
  const tools = pickTools(prompt, context);
  if (tools.length === 0) return { used: [], block: "" };
  const results = await Promise.all(tools.map(({ t }) => t.fetch(anonKey, userJwt)));
  const blocks = tools.map(({ t }, i) => {
    const rows = results[i];
    if (!rows || rows.length === 0) return `\n\n[${t.label}]\n(no rows — RLS may be blocking; ensure user is signed in for live data)`;
    return `\n\n[${t.label}]\n${JSON.stringify(rows, null, 2).slice(0, 4000)}`;
  });
  return { used: tools.map(({ name }) => name), block: blocks.join("") };
}

/* ─── Model providers ─────────────────────────────────────────────────── */
async function tryGemini(model, key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 800 }
    })
  });
  if (!resp.ok) return { ok: false, status: resp.status, detail: await resp.text() };
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
      max_tokens: 800
    })
  });
  if (!resp.ok) return { ok: false, status: resp.status, detail: await resp.text() };
  const j = await resp.json();
  return { ok: true, text: j?.choices?.[0]?.message?.content || "" };
}

/* ─── Handler ─────────────────────────────────────────────────────────── */
export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!gKey && !orKey) return new Response(JSON.stringify({ error: "no AI keys set" }), { status: 500, headers: { "content-type": "application/json" }});

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { "content-type": "application/json" }}); }
  const { prompt, context } = body || {};
  if (!prompt || typeof prompt !== "string") return new Response(JSON.stringify({ error: "prompt required" }), { status: 400, headers: { "content-type": "application/json" }});

  // Forward the user's Supabase JWT so PostgREST applies authenticated RLS.
  const auth = req.headers.get("x-supabase-auth") || req.headers.get("x-user-jwt") || "";
  const userJwt = auth.replace(/^Bearer\s+/i, "") || null;

  const t0 = Date.now();
  const data = await fetchData(prompt, context, userJwt);
  const tFetch = Date.now() - t0;

  const userMsg = `${SYSTEM}\n\n[Page context: ${context || "(none)"}]${data.block ? `\n\n=== DATA fetched on your behalf ===${data.block}` : ""}\n\n[Operator question]\n${prompt}`;

  // Gemini 2.0 → 1.5 → OpenRouter
  const attempts = [];
  for (const [name, fn] of [
    ["gemini-2.0-flash", () => gKey && tryGemini("gemini-2.0-flash", gKey, userMsg)],
    ["gemini-1.5-flash", () => gKey && tryGemini("gemini-1.5-flash", gKey, userMsg)],
    ["claude-3-haiku-via-openrouter", () => orKey && tryOpenRouter(orKey, userMsg)],
  ]) {
    const r = await fn();
    if (!r) continue;
    if (r.ok && r.text) {
      return new Response(JSON.stringify({
        text: r.text, ms: Date.now() - t0, model: name,
        fallback: name !== "gemini-2.0-flash" || undefined,
        tools_used: data.used, fetch_ms: tFetch
      }), { status: 200, headers: { "content-type": "application/json" }});
    }
    attempts.push({ provider: name, status: r.status, detail: (r.detail || "").slice(0, 200) });
  }

  return new Response(JSON.stringify({ error: "all providers failed", attempts }), {
    status: 502, headers: { "content-type": "application/json" }
  });
}
