// GET /api/agent/version — returns the current runtime manifest. Agent
// polls this hourly (alongside capability refresh). When `bundle_version`
// changes from the cached value, agent re-downloads any file whose
// sha256 differs.
//
// Bumping bundle_version: edit BUNDLE_VERSION below. The agent treats
// any version delta as authoritative and re-fetches changed files.
//
// File hashes are computed at build time by scripts/build-jsx.mjs (see
// the runtime-manifest emission in that script). At request time we
// just serve the precomputed file. If the manifest doesn't exist, we
// fall back to a minimal {bundle_version, files: []} so old agents
// don't crash.
import { cors } from "./_lib.js";

export const config = { runtime: "edge" };

// Bumped manually when we want to force a refresh even when contents
// haven't changed (e.g. forcing all agents to recheck).
export const BUNDLE_VERSION = "0.2.2";

// File set the agent ships. Mirrors install.sh.js / install.ps1.js.
const FILES = [
  "agent/quote_agent.py",
  "agent/runtime/__init__.py",
  "agent/runtime/agent.py",
  "agent/runtime/tools/__init__.py",
  "agent/runtime/tools/_stubs.py",
  "agent/runtime/tools/auto_quote.py",
  "agent/runtime/tools/twilio_dial.py",
  "agent/runtime/tools/draft_sms.py",
  "agent/runtime/tools/draft_email.py",
  "agent/runtime/tools/sendblue_send.py",
  "agent/runtime/tools/fathom_pull_notes.py",
  "agent/runtime/tools/linkedin_send.py",
  "agent/runtime/tools/linkedin_inbox_scan.py",
  "agent/runtime/tools/fb_pull_lead_forms.py",
  "agent/runtime/tools/ig_dm_reply.py",
  "agent/runtime/tools/meta_dm_send.py",
  "agent/runtime/tools/script_review.py",
  "agent/runtime/tools/file_review.py",
  "agent/runtime/tools/browser_run.py",
  "agent/runtime/tools/create_lead.py",
  "agent/runtime/tools/phone_link_dial.py",
];

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: cors() });

  const url = new URL(req.url);
  const apiBase = `${url.protocol}//${url.host}`;

  // We don't have build-time hashes shipped yet (would require extending
  // scripts/build-jsx.mjs to emit a manifest). Until that lands, return
  // file URLs without sha256, with a bundle_version that the agent uses
  // as a "did the bundle change" signal.
  return new Response(JSON.stringify({
    bundle_version: BUNDLE_VERSION,
    api_base: apiBase,
    files: FILES.map(f => {
      const rel = f.replace(/^agent\//, "");
      return {
        path: rel,                                         // dest under ~/.repflow/agent/
        url:  `${apiBase}/api/agent/runtime-file?path=${encodeURIComponent(rel)}`,
        // sha256: null — populated when build-jsx is extended; agent will
        // refetch on every bundle_version delta if hash absent.
      };
    }),
    issued_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...cors(), "cache-control": "no-store" },
  });
}
