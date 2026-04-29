import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are HUNTER, KOINO Agency's AI lead-scoring agent for an insurance career-shop (AIL/Globe Life style operation).

Score leads 1-10 based on:
- Source quality (referral=highest, aged=lowest)
- Urgency signals in notes
- Carrier fit (does the agency contract with that carrier)
- Demographic fit (household size, age band, income tier)
- Prior interactions with the agency

Return ONLY valid JSON matching the schema. No prose.

Tuning notes:
- Score 9-10 = page the producer immediately
- Score 7-8 = book a callback within 4 hours
- Score 4-6 = drop into nurture sequence
- Score 1-3 = respectful auto-decline
`;

interface ScoreRequest {
  lead: {
    full_name: string;
    phone?: string;
    email?: string;
    source?: string;
    notes?: string;
    formPayload?: Record<string, unknown>;
  };
  agencyContext?: {
    closedWonExamples?: Array<{ source: string; notes: string }>;
    activeCarriers?: string[];
  };
}

interface ScoreResponse {
  score: number;
  fit_reasoning: string;
  recommended_channel: "call" | "sms" | "email";
  recommended_send_window: string;
  hot_lead: boolean;
  close_probability: number;
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
      generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

export async function POST(req: NextRequest) {
  let body: ScoreRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.lead?.full_name) {
    return NextResponse.json(
      { error: "Missing required field: lead.full_name" },
      { status: 400 },
    );
  }

  try {
    const raw = (await callGemini(body)) as Partial<ScoreResponse>;

    // Validate
    const score = Number(raw.score);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      throw new Error(`Invalid score from LLM: ${raw.score}`);
    }
    const channel = raw.recommended_channel;
    if (!["call", "sms", "email"].includes(channel as string)) {
      throw new Error(`Invalid channel from LLM: ${channel}`);
    }

    const response: ScoreResponse = {
      score: Math.round(score),
      fit_reasoning: String(raw.fit_reasoning ?? ""),
      recommended_channel: channel as ScoreResponse["recommended_channel"],
      recommended_send_window: String(raw.recommended_send_window ?? "next 4 hours"),
      hot_lead: score >= 7,
      close_probability: Math.max(0, Math.min(1, Number(raw.close_probability) || score / 10)),
      version: "koino-agency-score-lead-v1",
    };

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: "Score-lead failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
