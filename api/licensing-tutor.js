// api/licensing-tutor.js — Edge function backing the /licensing page's
// Claude-tutored study guide + practice exam.
//
// Three modes:
//   mode: "tutor"       — chat Q&A. Body: { state, line, prompt, history? }.
//                          Returns { text, model }.
//   mode: "practice"    — serve one randomized multiple-choice question scoped
//                          to (state, line, variety_name?, domain?). Returns JSON:
//                          { stem, options:[4], correct_index, explanation, domain }.
//   mode: "study_guide" — generate ONE structured section of a state-exam study
//                          guide. Body: { state, line, variety_name, domain,
//                          weight_pct?, topics?: [string], section_number? }.
//                          Returns JSON: { section_number, title, blocks: [...] }
//                          where each block is heading | intro | table | bullets |
//                          callout. Renderer in page-licensing.jsx walks blocks
//                          to produce the same dense layout as the VA Series 1105
//                          cheat sheet.
//
// FREE-MODEL CASCADE — same vendors as api/copilot.js. Anthropic/Claude is
// PAID via OpenRouter; never add. The shared cost discipline lives in
// koinocapital@gmail.com's Vercel env (GEMINI_API_KEY / OPENROUTER_API_KEY).

export const config = { runtime: "edge" };

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";
const SUPA_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function dbSelect(path) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPA_ANON, authorization: `Bearer ${SUPA_ANON}` }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Best-effort write. If SUPABASE_SERVICE_ROLE_KEY isn't set, we silently
// skip — the live response still goes to the user; the bank just doesn't
// grow this turn. Designed so live-gen self-fills the cache: rep #1 pays
// the 5-10s LLM wait, rep #2 onward gets source:"bank" instantly.
async function dbUpsert(table, row, conflictCols) {
  if (!SUPA_SRV) return false;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflictCols}`, {
      method: "POST",
      headers: {
        apikey: SUPA_SRV, authorization: `Bearer ${SUPA_SRV}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    return r.ok;
  } catch { return false; }
}

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

const STUDY_GUIDE_SYSTEM = (state, line, variety_name, domain, weight_pct, topics, section_number) => `You are a licensing-exam study-guide writer for Repflow's /licensing surface. Your output renders as a dense, exam-grade cheat-sheet section in the style of the Virginia Series 1105 "Life & Annuities" guide produced by koinocapital.com — tight tables, bold key terms, no fluff, no padding paragraphs.

WRITE ONE SECTION:
  - State: ${state}
  - Exam variety: "${variety_name}"
  - Line of authority: ${line.toUpperCase()}
  - Section number: "${section_number || "01"}"
  - Section title (domain from the official content outline): "${domain}"
  - Domain weight on the exam: ${weight_pct != null ? weight_pct + "%" : "unspecified"}
  - Sub-topics from the official content outline: ${Array.isArray(topics) && topics.length ? topics.join(" · ") : "(use standard sub-topics for this domain)"}

OUTPUT — return EXACTLY ONE JSON object, no preamble, no markdown fence, no commentary:
{
  "section_number": "${section_number || "01"}",
  "title": "<the section title, ALL CAPS preferred — e.g. INSURANCE REGULATION>",
  "subtitle": "<one short line · summary of what this section covers>",
  "blocks": [
    /* a sequence of 4-9 blocks. Each block is one of: */

    { "type": "heading", "text": "<subsection name — e.g. Virginia Bureau of Insurance>" },

    { "type": "intro", "text": "<1-2 sentence framing line — only when truly needed>" },

    { "type": "table", "rows": [
        { "label": "<key term>",  "value": "<short emphasis — like '10 days' or '$1,000'>", "description": "<one-line explainer>" },
        { "label": "<key term>",  "value": null,                                              "description": "<one-line explainer>" }
      ]
    },

    { "type": "bullets", "items": [
        { "bold": "<bolded prefix — optional, can be null>", "text": "<the bullet content>" }
      ]
    },

    { "type": "callout", "kind": "<test_trick | warning | info>", "text": "<the highlight>" }
  ]
}

STYLE RULES — match the koinocapital VA guide:
1. The first block is always a "heading". Most sections have 2-4 subsections (each its own heading + a table or bullets).
2. Tables — use \`value\` only for time periods, money amounts, percentages, or short emphasis tokens (e.g. "10 days", "$50,000", "70%"). Otherwise leave \`value\` null and let \`description\` carry the explainer.
3. Bullets — use \`bold\` for the term being defined ("Term life:") and \`text\` for the definition. \`bold\` can be null for plain-prose bullets.
4. Callouts:
   - \`kind: "test_trick"\` — green-box-style "✓ Test trick: ..." (memorable trick / mnemonic for the exam)
   - \`kind: "warning"\` — red-box-style "■ ..." (e.g. "Must get WRITTEN APPROVAL before...", "Once a MEC, ALWAYS a MEC")
   - \`kind: "info"\` — blue-box-style notes (definitions, scope statements)
5. Be ${state}-specific where ${state} has a unique rule (CE hours, suitability training, free-look extensions, DOI structure, statute fines). Mark state-specific rows in the \`description\` when relevant.
6. NEVER copy or paraphrase actual exam questions — explain the concept the question tests, not the question itself.
7. Numbers MUST be accurate (10-day free look, 31-day grace, 2-year incontestability, 7-pay test, $50k group-life cap, etc.). Federal tax / NAIC numbers are universal; state fines + CE hours + suitability are state-specific.
8. Aim for ~4-9 blocks per section. Be DENSE. No throat-clearing intros, no "in conclusion" closings.

For the special domain "Master Numbers Drill" — return a single section with 2-3 grouped tables (Time Periods, Money & Percentages, Claims Numbers) covering every testable number relevant to a ${state} ${variety_name} exam-taker.

RETURN VALID JSON ONLY.`;

async function tryGemini(model, key, prompt, want_json, max_tokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: want_json ? 0.7 : 0.5,
      maxOutputTokens: max_tokens || (want_json ? 1500 : 900),
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

async function tryOpenRouter(key, prompt, model, want_json, max_tokens) {
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
        max_tokens: max_tokens || (want_json ? 1500 : 900),
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

function buildCascade(prompt, want_json, max_tokens) {
  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  return [
    ["gemini-2.5-flash",          () => gKey  && tryGemini("gemini-2.5-flash", gKey, prompt, want_json, max_tokens)],
    ["gemini-2.0-flash",          () => gKey  && tryGemini("gemini-2.0-flash", gKey, prompt, want_json, max_tokens)],
    ["gemini-2.0-flash (OR)",     () => orKey && tryOpenRouter(orKey, prompt, "google/gemini-2.0-flash-001", want_json, max_tokens)],
    ["llama-3.3-70b:free (OR)",   () => orKey && tryOpenRouter(orKey, prompt, "meta-llama/llama-3.3-70b-instruct:free", want_json, max_tokens)],
    ["deepseek-v3:free (OR)",     () => orKey && tryOpenRouter(orKey, prompt, "deepseek/deepseek-chat-v3-0324:free", want_json, max_tokens)],
    ["qwen-2.5-72b:free (OR)",    () => orKey && tryOpenRouter(orKey, prompt, "qwen/qwen-2.5-72b-instruct:free", want_json, max_tokens)],
  ];
}

async function runCascade(prompt, want_json, max_tokens) {
  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!gKey && !orKey) return { error: "no AI keys set" };
  const cascade = buildCascade(prompt, want_json, max_tokens);
  const attempts = [];
  for (const [name, fn] of cascade) {
    const r = await fn();
    if (!r) continue;
    if (r.ok && r.text) return { ok: true, text: r.text, model: name, attempts };
    attempts.push({ provider: name, status: r.status, detail: (r.detail || "").slice(0, 200) });
  }
  return { ok: false, error: "all providers failed", attempts };
}

// Same as runCascade but validates JSON parse + shape check via validateFn.
// If a model returns text that parses but fails validation, skip to the next model.
async function runCascadeWithValidation(prompt, want_json, max_tokens, validateFn) {
  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!gKey && !orKey) return { error: "no AI keys set" };
  const cascade = buildCascade(prompt, want_json, max_tokens);
  const attempts = [];
  for (const [name, fn] of cascade) {
    const r = await fn();
    if (!r) continue;
    if (r.ok && r.text) {
      const parsed = parseJsonLoose(r.text);
      if (parsed && validateFn(parsed)) {
        return { ok: true, text: r.text, parsed, model: name, attempts };
      }
      // Model returned text but it failed validation — try next model
      attempts.push({ provider: name, status: 422, detail: `returned text but failed shape validation` });
      continue;
    }
    attempts.push({ provider: name, status: r.status, detail: (r.detail || "").slice(0, 200) });
  }
  return { ok: false, error: "all providers failed or returned invalid shapes", attempts };
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
  if (mode !== "tutor" && mode !== "practice" && mode !== "study_guide") return bad(`mode must be 'tutor', 'practice', or 'study_guide'`);

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

  if (mode === "practice") {
    const domain        = body.domain ? String(body.domain).slice(0, 120) : null;
    const variety_id    = body.variety_id ? String(body.variety_id).slice(0, 60) : null;
    const variety_name  = body.variety_name ? String(body.variety_name).slice(0, 160) : null;

    // Try the pre-stored question bank first.
    // Multi-tier fallback ensures users get fast, reliable questions from the bank
    // even if live LLM providers are down or rate limited.
    const queryBank = async (extraFilters = []) => {
      const filters = [
        "select=stem,options,correct_index,explanation,domain,difficulty,source_url",
        "limit=100",
        ...extraFilters
      ];
      return await dbSelect(`licensing_questions?${filters.join("&")}`);
    };

    let bankRows = null;
    if (variety_id) {
      // Tier 1: State + Variety + Domain
      if (domain) {
        bankRows = await queryBank([`state_code=eq.${state}`, `variety_id=eq.${encodeURIComponent(variety_id)}`, `domain=eq.${encodeURIComponent(domain)}`]);
      }
      // Tier 2: State + Variety (any domain)
      if (!Array.isArray(bankRows) || bankRows.length === 0) {
        bankRows = await queryBank([`state_code=eq.${state}`, `variety_id=eq.${encodeURIComponent(variety_id)}`]);
      }
    }
    // Tier 3: State + Line
    if (!Array.isArray(bankRows) || bankRows.length === 0) {
      bankRows = await queryBank([`state_code=eq.${state}`, `line=eq.${encodeURIComponent(line)}`]);
    }
    // Tier 4: Any matching Line in the bank
    if (!Array.isArray(bankRows) || bankRows.length === 0) {
      bankRows = await queryBank([`line=eq.${encodeURIComponent(line)}`]);
    }

    if (Array.isArray(bankRows) && bankRows.length > 0) {
      const pick = bankRows[Math.floor(Math.random() * bankRows.length)];
      return new Response(JSON.stringify({ ...pick, source: "bank", ms: 0 }), { status: 200, headers: { "content-type": "application/json" }});
    }

    // Fallback: live generate — with validated cascade (tries next model if shape is bad).
    const fullPrompt = PRACTICE_SYSTEM(state, line, domain);
    const t0 = Date.now();
    const isValidQuestion = (q) =>
      q && typeof q.stem === "string" && q.stem.length > 5 &&
      Array.isArray(q.options) && q.options.length === 4 &&
      q.options.every(o => typeof o === "string" && o.length > 0) &&
      typeof q.correct_index === "number" && q.correct_index >= 0 && q.correct_index <= 3;

    const r = await runCascadeWithValidation(fullPrompt, true, 1500, isValidQuestion);
    if (!r.ok) {
      const hint = (r.attempts || []).map(a => `${a.provider}: ${a.detail}`).join("; ");
      return new Response(JSON.stringify({ error: `All models failed to generate a valid question. ${hint}`, attempts: r.attempts }), { status: 502, headers: { "content-type": "application/json" }});
    }
    let q = r.parsed;
    // Fire-and-forget cache write so the bank grows organically through use.
    if (variety_id && domain) {
      const line_ = String(body.line || "").toLowerCase().trim() || "life";
      // No await — let it run after the response goes out. Edge fn runtime allows this.
      dbUpsert(
        "licensing_questions",
        {
          state_code: state, line: line_, variety_id, domain,
          stem: q.stem, options: q.options, correct_index: q.correct_index,
          explanation: q.explanation || null, difficulty: q.difficulty || null,
        },
        "" // no conflict cols — every live gen adds a new row to the bank
      ).catch(() => {});
    }
    return new Response(JSON.stringify({ ...q, source: "live", model: r.model, ms: Date.now() - t0 }), { status: 200, headers: { "content-type": "application/json" }});
  }

  // mode === "study_guide"
  const domain         = String(body.domain || "").slice(0, 120).trim();
  const variety_id     = String(body.variety_id || "").slice(0, 60).trim();
  const variety_name   = String(body.variety_name || "").slice(0, 160).trim();
  const weight_pct     = (typeof body.weight_pct === "number") ? body.weight_pct : null;
  const topics         = Array.isArray(body.topics) ? body.topics.slice(0, 12).map(t => String(t).slice(0, 100)) : null;
  const section_number = String(body.section_number || "").slice(0, 8).trim() || "01";
  if (!domain || !variety_name) return bad("study_guide mode requires variety_name and domain");

  // Try the pre-stored section first if a variety_id was provided.
  if (variety_id) {
    const filters = [
      `state_code=eq.${state}`,
      `variety_id=eq.${encodeURIComponent(variety_id)}`,
      `section_number=eq.${encodeURIComponent(section_number)}`,
      "select=section_doc,model,generated_at",
      "limit=1",
    ];
    const rows = await dbSelect(`licensing_guide_sections?${filters.join("&")}`);
    if (Array.isArray(rows) && rows.length > 0 && rows[0].section_doc) {
      return new Response(JSON.stringify({ ...rows[0].section_doc, source: "bank", model: rows[0].model || null, generated_at: rows[0].generated_at }), { status: 200, headers: { "content-type": "application/json" }});
    }
  }

  // Fallback: live generate.
  const fullPrompt = STUDY_GUIDE_SYSTEM(state, line, variety_name, domain, weight_pct, topics, section_number);
  const t0 = Date.now();
  const r = await runCascade(fullPrompt, true, 3500);
  if (!r.ok) return new Response(JSON.stringify({ error: r.error || "model failed", attempts: r.attempts }), { status: 502, headers: { "content-type": "application/json" }});
  const section = parseJsonLoose(r.text);
  if (!section || typeof section !== "object" || !Array.isArray(section.blocks)) {
    return new Response(JSON.stringify({ error: "model returned invalid section shape", raw: section || r.text.slice(0, 500) }), { status: 502, headers: { "content-type": "application/json" }});
  }
  // Fire-and-forget cache upsert. Next rep on the same (state, variety, section)
  // gets source:"bank" instantly. This is how the bank fills despite Gemini's
  // 250-RPD free quota that makes batch pre-generation infeasible.
  if (variety_id) {
    dbUpsert(
      "licensing_guide_sections",
      {
        state_code: state, variety_id, section_number,
        domain, weight_pct,
        section_doc: section,
        model: r.model || null,
        generated_at: new Date().toISOString(),
      },
      "state_code,variety_id,section_number"
    ).catch(() => {});
  }
  return new Response(JSON.stringify({ ...section, source: "live", model: r.model, ms: Date.now() - t0 }), { status: 200, headers: { "content-type": "application/json" }});
}

function parseJsonLoose(text) {
  if (typeof text !== "string") return null;
  // Direct parse first.
  try { return JSON.parse(text.trim()); } catch {}
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenced = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try { return JSON.parse(fenced); } catch {}
  // Extract the first top-level { ... } block (greedy innermost match to avoid nested issues).
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch {}
  // Last resort: try to fix common issues like trailing commas.
  try {
    const cleaned = m[0].replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  } catch { return null; }
}
