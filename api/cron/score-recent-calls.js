// GET /api/cron/score-recent-calls — AI coaching analysis for unscored call recordings.
//
// Runs every 30 minutes (see vercel.json cron). Finds call_recordings from the
// last 24h that have no call_coaching_scores row, then scores each via LLM.
//
// LLM cascade: ANTHROPIC_API_KEY → OPENAI_API_KEY → log "no key, skipping"
//
// Idempotent: re-scoring the same recording upserts the row.
// Gate: if no LLM key set → returns 503 with clear instruction.

import { SUPA_URL, SERVICE } from "../agent/_lib.js";

export const config = { runtime: "edge", maxDuration: 300 };

const MAX_PER_RUN = 10;  // don't overwhelm the LLM API on a single cron run

export default async function handler(req) {
  if (!SERVICE) {
    return new Response(JSON.stringify({ error: "no_service_key" }), { status: 503 });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const OPENAI_KEY    = process.env.OPENAI_API_KEY;

  if (!ANTHROPIC_KEY && !OPENAI_KEY) {
    console.warn("[score-recent-calls] No LLM key set — coaching scoring disabled");
    return new Response(JSON.stringify({
      error: "llm_not_configured",
      message: "Set OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel env to enable coaching analysis.",
      missing: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
      gate: true,
    }), { status: 503 });
  }

  // ── Find unscored recordings from the last 24h ────────────────────────────
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recR  = await fetch(
    `${SUPA_URL}/rest/v1/call_recordings` +
    `?select=*,pipeline(lead_name)` +
    `&ended_at=gte.${encodeURIComponent(since)}` +
    `&order=ended_at.desc&limit=${MAX_PER_RUN}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
  );
  if (!recR.ok) {
    return new Response(JSON.stringify({ error: "recordings_fetch_failed", status: recR.status }), { status: 500 });
  }
  const recordings = await recR.json();
  if (!Array.isArray(recordings) || recordings.length === 0) {
    return new Response(JSON.stringify({ ok: true, scored: 0, skipped: 0, reason: "no recent recordings" }));
  }

  // Exclude recordings that already have a score
  const ids = recordings.map(r => `"${r.id}"`).join(",");
  const existR = await fetch(
    `${SUPA_URL}/rest/v1/call_coaching_scores` +
    `?select=call_recording_id&call_recording_id=in.(${ids})`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
  );
  const existing = existR.ok ? await existR.json() : [];
  const scored_ids = new Set(existing.map(r => r.call_recording_id));
  const toScore = recordings.filter(r => !scored_ids.has(r.id));

  if (toScore.length === 0) {
    return new Response(JSON.stringify({ ok: true, scored: 0, skipped: recordings.length, reason: "all already scored" }));
  }

  let scoredCount = 0;
  let errors      = [];

  for (const rec of toScore) {
    try {
      await scoreRecording(rec, { ANTHROPIC_KEY, OPENAI_KEY });
      scoredCount++;
    } catch (e) {
      errors.push({ id: rec.id, error: e.message });
      console.error("[score-recent-calls] failed for", rec.id, e.message);
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    scored: scoredCount,
    skipped: recordings.length - toScore.length,
    errors,
  }));
}

// ── Score a single recording via LLM ─────────────────────────────────────────
async function scoreRecording(rec, { ANTHROPIC_KEY, OPENAI_KEY }) {
  const transcript = rec.transcript_text
    || (rec.transcript_url ? await fetchTranscript(rec.transcript_url) : null)
    || null;

  const leadName = rec.lead_name || rec.pipeline?.lead_name || "the lead";
  const durMin   = rec.duration_sec ? `${Math.round(rec.duration_sec / 60)} minutes` : "unknown duration";

  const systemPrompt = `You are an expert insurance sales coach. Analyze the following sales call transcript and return a JSON object with EXACTLY this structure:

{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence call summary>",
  "talk_ratio_pct": <rep's % of talk time, 0-100, estimate from transcript>,
  "filler_count": <count of um/uh/like/you know>,
  "objections": [
    { "objection": "<what lead said>", "handling": "<how rep responded>", "verdict": "good|ok|missed" }
  ],
  "action_items": [
    { "item": "<specific next step>", "owner": "rep|lead|both" }
  ],
  "coaching_points": [
    { "point": "<coaching focus>", "example": "<specific moment from call>", "improvement": "<what to do differently>" }
  ],
  "sentiment_arc": [
    { "t_pct": <0-100>, "sentiment": "positive|neutral|negative" }
  ]
}

Rules: Return ONLY valid JSON. No prose before or after. If transcript is missing, set score=null and explain in summary.`;

  const userMsg = transcript
    ? `Call with ${leadName} (${durMin}):\n\n${transcript.slice(0, 8000)}`
    : `No transcript available for call with ${leadName} (${durMin}). Score based on available metadata only.`;

  let result = null;
  let modelUsed = null;

  // Try Anthropic first, then OpenAI
  if (ANTHROPIC_KEY) {
    try {
      result = await callAnthropic(systemPrompt, userMsg, ANTHROPIC_KEY);
      modelUsed = "claude-haiku-4-5-20251001";
    } catch (e) {
      console.warn("[score-recent-calls] Anthropic failed:", e.message);
    }
  }
  if (!result && OPENAI_KEY) {
    result = await callOpenAI(systemPrompt, userMsg, OPENAI_KEY);
    modelUsed = "gpt-4o-mini";
  }
  if (!result) throw new Error("all LLM backends failed");

  // Upsert into call_coaching_scores
  await fetch(`${SUPA_URL}/rest/v1/call_coaching_scores`, {
    method:  "POST",
    headers: {
      apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      call_recording_id: rec.id,
      agency_id:         rec.agency_id,
      rep_id:            rec.rep_id || null,
      score:             typeof result.score === "number" ? result.score : null,
      summary:           result.summary || null,
      talk_ratio_pct:    result.talk_ratio_pct ?? null,
      filler_count:      result.filler_count ?? null,
      objections:        result.objections || [],
      action_items:      result.action_items || [],
      coaching_points:   result.coaching_points || [],
      sentiment_arc:     result.sentiment_arc || [],
      model_used:        modelUsed,
      scored_at:         new Date().toISOString(),
    }),
  });
}

async function callAnthropic(system, user, key) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "x-api-key":        key,
      "anthropic-version":"2023-06-01",
      "content-type":     "application/json",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${j.error?.message || "unknown"}`);
  const text = j.content?.[0]?.text || "";
  return parseJsonFromText(text);
}

async function callOpenAI(system, user, key) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${j.error?.message || "unknown"}`);
  const text = j.choices?.[0]?.message?.content || "";
  return parseJsonFromText(text);
}

function parseJsonFromText(text) {
  // Handle markdown fences
  const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(clean);
}

async function fetchTranscript(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.text() : null;
  } catch { return null; }
}
