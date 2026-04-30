// /api/agents/issue-token — mints a one-time enrollment token, returns the
// curl-and-run install command for the operator to paste on their VPS or Mac.

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zybndnqnbxarpkhqpcxq.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W";

  const body = req.body ? await req.json().catch(() => ({})) : {};
  const hint = (body && body.hint) || "host";

  const token = "rfk_" + crypto.randomUUID().replace(/-/g, "");
  const resp = await fetch(`${url}/rest/v1/agent_install_tokens`, {
    method: "POST",
    headers: {
      "apikey": key,
      "authorization": `Bearer ${key}`,
      "content-type": "application/json",
      "prefer": "return=minimal"
    },
    body: JSON.stringify({ token, hint })
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return new Response(JSON.stringify({ error: "mint failed", detail }), { status: 502, headers: { "content-type": "application/json" }});
  }

  const origin = new URL(req.url).origin;
  const cmd = `curl -fsSL ${origin}/install.sh | REPFLOW_TOKEN=${token} REPFLOW_URL=${origin} sh`;

  return new Response(JSON.stringify({ token, install_command: cmd, expires_in_hours: 24 }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
