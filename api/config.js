// /api/config — public runtime configuration for the browser.
// Returns env-derived public keys + flags so the SPA can configure
// third-party SDKs (PostHog, etc.) without bundling secrets at build time.
//
// IMPORTANT: only return values that are SAFE for any browser to see.
// PostHog public project keys (phc_*) are intentionally browser-safe.
// Never put service-role keys, OAuth client secrets, or anything else
// that grants write access from here.
//
// Cached aggressively (15 min, public) — the values change infrequently
// and the client re-fetches on a hard reload anyway.

export const config = { runtime: "edge" };

function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, OPTIONS",
    "cache-control": "public, max-age=900",
  };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  const body = {
    posthog_key:  process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || null,
    posthog_host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    env:          process.env.VERCEL_ENV || "development",
  };

  return new Response(JSON.stringify(body), { headers: corsHeaders() });
}
