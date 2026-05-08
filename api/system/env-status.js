// /api/system/env-status — returns which platform-level env vars are set.
//
// CRITICAL: NEVER returns the actual values. Just presence flags so the
// super-admin's System page can show "OPENAI_API_KEY ✓" vs "OPENAI_API_KEY ⚠
// missing — set in Vercel project settings".

export const config = { runtime: "edge" };

const KEYS = [
  // Transcription / AI
  { name: "OPENAI_API_KEY",          purpose: "Whisper transcription (preferred)",       category: "transcription" },
  { name: "GEMINI_API_KEY",          purpose: "Gemini 2.0 Flash audio fallback",         category: "transcription" },
  { name: "OPENAI_TRANSCRIBE_MODEL", purpose: "(optional) override whisper-1 → gpt-4o-transcribe", category: "transcription" },
  // Copilot
  { name: "OPENROUTER_API_KEY",      purpose: "AI co-pilot (free tier cascade)",         category: "copilot" },
  { name: "GOOGLE_AI_KEY",           purpose: "Direct Gemini for copilot",                category: "copilot" },
  // Licensing
  { name: "NIPR_USER_ID",            purpose: "NIPR PDB user ID (license verify)",       category: "licensing" },
  { name: "NIPR_PASSWORD",           purpose: "NIPR PDB password",                       category: "licensing" },
  // Database
  { name: "SUPABASE_URL",            purpose: "Supabase project URL",                    category: "database" },
  { name: "SUPABASE_SERVICE_ROLE_KEY",purpose: "Service role for cross-tenant cron jobs", category: "database" },
  { name: "SUPABASE_PUBLISHABLE_KEY",purpose: "Publishable key (client + worker fallback)", category: "database" },
  // Auth / email (platform-level)
  { name: "BREVO_API_KEY",           purpose: "Platform-wide email sender (magic links + invites)", category: "auth" },
  { name: "RESEND_API_KEY",          purpose: "Alternative email sender",                category: "auth" },
];

export default async function handler(req) {
  const out = KEYS.map(k => ({
    name: k.name,
    purpose: k.purpose,
    category: k.category,
    set: !!process.env[k.name],
  }));
  return new Response(JSON.stringify({ ok: true, env: out }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
