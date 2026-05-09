// /api/agents/issue-token — two flows in one endpoint:
//
//   1. **Mint** (operator-side, from the Hardware page): requires `Authorization:
//      Bearer <jwt>`, caller must resolve via public.me() to a row with
//      role in ('owner','manager'). Mints a one-time enrollment token.
//
//   2. **Bootstrap** (host-side, called from install.sh): no JWT. Caller passes
//      `_token_lookup` so we know they already have a valid token. We do NOT
//      mint anything — we return only the public Supabase URL+anon key, so the
//      installer can keep working after Supabase ownership transfers.
//
// install.sh enrollment goes through the SECURITY DEFINER `enroll_host()` RPC,
// which validates the token server-side. This endpoint never reads the
// agent_install_tokens table — the lookup field is only a marker so we know
// to take the bootstrap branch.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

const ALLOWED_ROLES = new Set(["owner", "manager", "super_admin"]);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function publicConfig() {
  return { supabase_url: SUPA_URL, supabase_anon: ANON };
}

async function resolveCaller(jwt) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
    method: "POST",
    headers: {
      "apikey": ANON,
      "authorization": `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!r.ok) return null;
  try {
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const body = await req.json().catch(() => ({}));

  // Bootstrap flow: install.sh sends `_token_lookup` because it already has a
  // token and just needs the public config. No mint. No auth. Returns only
  // the Supabase URL + anon key (both already public-by-design).
  if (body && body._token_lookup) {
    return jsonResponse(publicConfig());
  }

  // Mint flow: operator-side. Require JWT + owner/manager.
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "missing bearer token" }, 401);
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) return jsonResponse({ error: "missing bearer token" }, 401);

  const me = await resolveCaller(jwt);
  if (!me || !me.rep_id) {
    return jsonResponse({ error: "unauthenticated" }, 401);
  }
  if (!ALLOWED_ROLES.has(me.role)) {
    return jsonResponse({ error: "forbidden", detail: "role must be owner or manager to mint enrollment tokens" }, 403);
  }

  const hint = (typeof body.hint === "string" && body.hint.slice(0, 120)) || "host";

  const token = "rfk_" + crypto.randomUUID().replace(/-/g, "");
  const resp = await fetch(`${SUPA_URL}/rest/v1/agent_install_tokens`, {
    method: "POST",
    headers: {
      "apikey": ANON,
      "authorization": `Bearer ${jwt}`,
      "content-type": "application/json",
      "prefer": "return=minimal",
    },
    body: JSON.stringify({ token, hint }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return jsonResponse({ error: "mint failed", detail }, 502);
  }

  const origin = new URL(req.url).origin;
  const cmd = `curl -fsSL ${origin}/install.sh | REPFLOW_TOKEN=${token} REPFLOW_URL=${origin} sh`;

  return jsonResponse({
    token,
    install_command: cmd,
    expires_in_hours: 24,
    issued_to_agency: me.agency_id,
    ...publicConfig(),
  });
}
