import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are CLOSER, KOINO Agency's AI follow-up drafter for an insurance career-shop.

Generate a 5-touch follow-up sequence. Each touch:
- Matches the producer's voice (sentence length, contractions, regional phrasing, sign-off) if a producer_voice sample is provided.
- Falls back to "warm, plain-spoken career-agent" register otherwise.
- Touches 1-3 are value-first / helpful (no hard CTA).
- Touch 4 escalates to a concrete next step (two specific time slots).
- Touch 5 is a clean breakup ("Last note from me — if this isn't a fit, totally fine.").

Channels: alternate among call / sms / email based on what fits each touch.
Default cadence: 1h / 24h / 72h / 120h / 168h after first contact.

Return ONLY valid JSON matching the schema. No prose.`;

interface FollowupRequest {
  lead: { full_name: string; phone?: string; email?: string };
  prior_touches?: Array<{ channel: string; sent_at: string; body: string; outcome?: string }>;
  producer_voice?: string;
  vertical?: string;
}

interface Touch {
  touch_number: 1 | 2 | 3 | 4 | 5;
  channel: "call" | "sms" | "email";
  send_after_hours: number;
  subject?: string;
  body: string;
  rationale: string;
}

interface FollowupResponse {
  sequence: Touch[];
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
      generationConfig: { temperature: 0.5, maxOutputTokens: 2200, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

export async function POST(req: NextRequest) {
  let body: FollowupRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.lead?.full_name) {
    return NextResponse.json({ error: "Missing required field: lead.full_name" }, { status: 400 });
  }

  try {
    const raw = (await callGemini(body)) as Partial<FollowupResponse>;
    const seq = raw.sequence;
    if (!Array.isArray(seq) || seq.length !== 5) {
      throw new Error(`Expected 5 touches, got ${seq?.length}`);
    }
    const touchNums = new Set(seq.map((t) => t.touch_number));
    if (touchNums.size !== 5) throw new Error("Duplicate touch_numbers");
    for (const t of seq) {
      if (!["call", "sms", "email"].includes(t.channel)) {
        throw new Error(`Invalid channel: ${t.channel}`);
      }
      if (typeof t.send_after_hours !== "number" || t.send_after_hours < 0) {
        throw new Error(`Invalid send_after_hours: ${t.send_after_hours}`);
      }
      if (!t.body || t.body.trim().length === 0) {
        throw new Error(`Empty body for touch ${t.touch_number}`);
      }
    }

    return NextResponse.json({
      sequence: seq,
      version: "koino-agency-followup-v1",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Generate-followup failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
