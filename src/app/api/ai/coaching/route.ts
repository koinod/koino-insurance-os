import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are COACH, KOINO Agency's AI coaching agent for insurance producers.

Given a producer's recent calls (transcripts + outcomes) and their current pipeline, generate:
- top_strengths (3 bullets — concrete, with quotes from their actual calls if possible)
- top_growth_areas (3 bullets — patterns where they consistently lose deals)
- next_call_focus (single sentence — the one thing to try on their next call)
- drill_recommendations (2-4 specific role-play / objection-handling drills)
- one_thing_to_try_tomorrow (single concrete behavior change)

Be honest, not flattering. Real coaching feedback is uncomfortable and specific.

Return ONLY valid JSON matching the schema. No prose.`;

interface CoachingRequest {
  rep: {
    name: string;
    recent_calls: Array<{ transcript: string; outcome: string; deal_size?: number }>;
    current_pipeline?: Array<{ stage: string; deal_size: number }>;
  };
  agency_context?: {
    vertical?: string;
    top_carriers?: string[];
  };
}

interface CoachingResponse {
  rep_name: string;
  top_strengths: string[];
  top_growth_areas: string[];
  next_call_focus: string;
  drill_recommendations: string[];
  one_thing_to_try_tomorrow: string;
  version: string;
}

async function callGemini(payload: object): Promise<unknown> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

export async function POST(req: NextRequest) {
  let body: CoachingRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.rep?.name) {
    return NextResponse.json({ error: "Missing required field: rep.name" }, { status: 400 });
  }
  if (!Array.isArray(body.rep.recent_calls) || body.rep.recent_calls.length === 0) {
    return NextResponse.json(
      { error: "Missing required field: rep.recent_calls (at least 1 call)" },
      { status: 400 },
    );
  }

  try {
    const raw = (await callGemini(body)) as Partial<CoachingResponse>;
    if (!Array.isArray(raw.top_strengths) || raw.top_strengths.length === 0) {
      throw new Error("Missing top_strengths from LLM");
    }
    if (!Array.isArray(raw.top_growth_areas) || raw.top_growth_areas.length === 0) {
      throw new Error("Missing top_growth_areas from LLM");
    }

    return NextResponse.json({
      rep_name: body.rep.name,
      top_strengths: raw.top_strengths,
      top_growth_areas: raw.top_growth_areas,
      next_call_focus: String(raw.next_call_focus ?? ""),
      drill_recommendations: Array.isArray(raw.drill_recommendations)
        ? raw.drill_recommendations
        : [],
      one_thing_to_try_tomorrow: String(raw.one_thing_to_try_tomorrow ?? ""),
      version: "koino-agency-coaching-v1",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Coaching failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
