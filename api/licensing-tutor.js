// api/licensing-tutor.js — Edge function backing the /licensing page's
// Claude-tutored study guide + practice exam.
//
// Two modes:
//   mode: "tutor"    — chat Q&A. Body: { state, line, prompt, history? }.
//                      Returns { text, model }.
//   mode: "practice" — serve one randomized multiple-choice question scoped
//                      to (state, line). Body: { state, line, domain? }.
//                      Returns JSON: { stem, options:[4], correct_index,
//                                       explanation, domain }.
//
// FREE-MODEL CASCADE — same vendors as api/copilot.js. Anthropic/Claude is
// PAID via OpenRouter; never add. The shared cost discipline lives in
// koinocapital@gmail.com's Vercel env (GEMINI_API_KEY / OPENROUTER_API_KEY).

export const config = { runtime: "edge" };

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY"
]);
const VALID_LINES = new Set(["life","health","annuity","mortgage_protection"]);

const TUTOR_SYSTEM = (state, line) => `You are a licensing tutor inside Repflow — an insurance-agent OS. You are coaching a brand-new producer who is preparing to take the ${line.toUpperCase()} producer-license exam in ${state}.

YOUR JOB:
- Answer the producer's questions clearly, like a patient instructor preparing them for the ${state} state exam.
- Use plain language. Define every insurance term the first time you use it.
- When a question has a state-specific answer, mark "(${state} specific)" so the rep knows it varies elsewhere.
- When the answer is universal (NAIC model, federal tax treatment), say so explicitly.
- Cite the LoA section the question falls under: General Insurance Concepts, Life Basics, Policy Provisions, Riders & Options, Underwriting, Tax Treatment, State Law.

HARD RULES:
1. NEVER quote a specific exam question or claim insider knowledge of any state's actual exam content — that would be a violation. You explain concepts; the rep practices via the practice-exam mode.
2. If asked something outside ${line} licensing prep (e.g. lead-gen, P&L, software): reply "Outside my scope — I'm only your ${line} licensing tutor. Ask in the AI co-pilot rail for that."
3. If you don't know a ${state}-specific value (CE hours, fingerprint vendor, etc.): say so plainly and point them at the Requirements panel on this page or the state DOI.
4. No legal advice. No marketing-language coaching. If asked, decline and explain the producer would need to consult compliance.

STYLE: 1-3 short paragraphs. Numbered steps when explaining a process. Examples with round numbers ($100k death benefit, $50/mo premium) when illustrating mechanics.`;

const PRACTICE_SYSTEM = (state, line, domain) => `You are a licensing-exam item-writer for Repflow's /licensing practice surface. Generate ONE multiple-choice question scoped to:
  - Line: ${line.toUpperCase()}
  - State: ${state}
  - Domain: ${domain || "any standard domain (General Insurance, Policy Provisions, Riders, Underwriting, Tax, State Law)"}

OUTPUT — RETURN EXACTLY ONE JSON OBJECT, NO PREAMBLE, NO MARKDOWN FENCE, NO COMMENTARY:
{
  "stem": "<the question — single sentence ending in '?'>",
  "options": ["<A>", "<B>", "<C>", "<D>"],
  "correct_index": <0-3>,
  "explanation": "<2-3 sentences explaining why the correct answer is right AND why the most-tempting distractor is wrong>",
  "domain": "<one of: General Insurance Concepts | Life Basics | Policy Provisions | Riders & Options | Underwriting | Tax Treatment | State Law>",
  "difficulty": "<easy|medium|hard>"
}

ITEM-WRITING RULES:
1. The stem must test ONE concept. No double-barreled questions.
2. All four options must be plausible to someone who half-prepped. No throwaway distractors ("the moon" etc.).
3. correct_index points to the actual correct answer in the options array.
4. Do NOT copy known exam items. Write a new question that tests the same concept.
5. For State Law domain: ground in ${state}'s actual statute or NAIC model where ${state} has adopted it. If unsure, choose a different domain.
6. For ${line} = mortgage_protection: questions should focus on advertising/unfair-trade-practice rules and the underlying Life-LoA term-life mechanics.

RETURN VALID JSON ONLY. Anything outside the JSON object will be rejected.`;

async function tryGemini(model, key, prompt, want_json) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: want_json ? 0.7 : 0.5,
      maxOutputTokens: want_json ? 700 : 900,
      ...(want_json ? { responseMimeType: "application/json" } : {})
    }
  };
  let resp;
  try {
    resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    return { ok: false, status: 0, detail: String(e) };
  }
  if (!resp.ok) return { ok: false, status: resp.status, detail: (await resp.text()).slice(0, 400) };
  const j = await resp.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) return { ok: false, status: 502, detail: "empty Gemini response" };
  return { ok: true, text };
}

async function tryOpenRouter(key, prompt, model, want_json) {
  let resp;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${key}`,
        "http-referer": "https://repflow.koino.capital",
        "x-title": "Repflow"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: want_json ? 0.7 : 0.5,
        max_tokens: want_json ? 700 : 900,
        ...(want_json ? { response_format: { type: "json_object" } } : {})
      })
    });
  } catch (e) {
    return { ok: false, status: 0, detail: String(e) };
  }
  if (!resp.ok) return { ok: false, status: resp.status, detail: (await resp.text()).slice(0, 400) };
  const j = await resp.json();
  const text = j?.choices?.[0]?.message?.content || "";
  if (!text) return { ok: false, status: 502, detail: "empty OpenRouter response" };
  return { ok: true, text };
}

async function runCascade(prompt, want_json) {
  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!gKey && !orKey) return { error: "no AI keys set" };
  const cascade = [
    ["gemini-2.5-flash",        () => gKey  && tryGemini("gemini-2.5-flash", gKey, prompt, want_json)],
    ["gemini-2.0-flash",        () => gKey  && tryGemini("gemini-2.0-flash", gKey, prompt, want_json)],
    ["gemini-2.0-flash (OR)",   () => orKey && tryOpenRouter(orKey, prompt, "google/gemini-2.0-flash-001", want_json)],
    ["llama-3.3-70b:free (OR)", () => orKey && tryOpenRouter(orKey, prompt, "meta-llama/llama-3.3-70b-instruct:free", want_json)],
    ["deepseek-v3:free (OR)",   () => orKey && tryOpenRouter(orKey, prompt, "deepseek/deepseek-chat-v3-0324:free", want_json)],
  ];
  const attempts = [];
  for (const [name, fn] of cascade) {
    const r = await fn();
    if (!r) continue;
    if (r.ok && r.text) return { ok: true, text: r.text, model: name, attempts };
    attempts.push({ provider: name, status: r.status, detail: (r.detail || "").slice(0, 200) });
  }
  return { ok: false, error: "all providers failed", attempts };
}

function bad(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { "content-type": "application/json" }});
}

export default async function handler(req) {
  if (req.method !== "POST") return bad("POST only", 405);

  let body;
  try { body = await req.json(); } catch { return bad("bad json"); }
  body = body || {};

  const state = String(body.state || "").toUpperCase().trim();
  const line  = String(body.line  || "").toLowerCase().trim();
  const mode  = String(body.mode  || "").toLowerCase().trim();
  if (!VALID_STATES.has(state))     return bad(`invalid state: ${state}`);
  if (!VALID_LINES.has(line))       return bad(`invalid line: ${line}`);
  if (mode !== "tutor" && mode !== "practice") return bad(`mode must be 'tutor' or 'practice'`);

  if (mode === "tutor") {
    const prompt = String(body.prompt || "").trim();
    if (!prompt || prompt.length > 4000) return bad("prompt must be 1-4000 chars");
    const history = Array.isArray(body.history) ? body.history.slice(-3) : [];
    const historyBlock = history.length
      ? "\n\n[Recent turns — context only, do not repeat]\n" +
        history.map((t, i) => `Turn ${i+1}:\n  rep: ${(t.q || "").slice(0,600)}\n  you: ${(t.a || "").slice(0,800)}`).join("\n")
      : "";
    const fullPrompt = `${TUTOR_SYSTEM(state, line)}${historyBlock}\n\n[Rep's question]\n${prompt}`;
    const t0 = Date.now();
    const r = await runCascade(fullPrompt, false);
    if (!r.ok) return new Response(JSON.stringify({ error: r.error || "model failed", attempts: r.attempts }), { status: 502, headers: { "content-type": "application/json" }});
    return new Response(JSON.stringify({ text: r.text, model: r.model, ms: Date.now() - t0 }), { status: 200, headers: { "content-type": "application/json" }});
  }

  // mode === "practice"
  const domain = body.domain ? String(body.domain).slice(0, 80) : null;
  const fullPrompt = PRACTICE_SYSTEM(state, line, domain);
  const t0 = Date.now();
  const r = await runCascade(fullPrompt, true);
  if (!r.ok) return new Response(JSON.stringify({ error: r.error || "model failed", attempts: r.attempts }), { status: 502, headers: { "content-type": "application/json" }});
  // Parse + validate the JSON the model returned.
  let q;
  try {
    q = JSON.parse(r.text);
  } catch {
    // Some models wrap in ```json``` fences despite the instruction.
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) return new Response(JSON.stringify({ error: "model returned non-JSON", raw: r.text.slice(0, 500) }), { status: 502, headers: { "content-type": "application/json" }});
    try { q = JSON.parse(m[0]); } catch { return new Response(JSON.stringify({ error: "model returned malformed JSON", raw: r.text.slice(0, 500) }), { status: 502, headers: { "content-type": "application/json" }}); }
  }
  if (!q || typeof q.stem !== "string" || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correct_index !== "number" || q.correct_index < 0 || q.correct_index > 3) {
    return new Response(JSON.stringify({ error: "model returned invalid question shape", raw: q }), { status: 502, headers: { "content-type": "application/json" }});
  }
  return new Response(JSON.stringify({ ...q, model: r.model, ms: Date.now() - t0 }), { status: 200, headers: { "content-type": "application/json" }});
}
