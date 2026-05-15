// GET /api/agent/runtime-file?path=runtime/agent.py
//
// Serves files from the deployed agent/ tree. Vercel doesn't serve files
// outside outputDirectory; this endpoint reads them from the function
// bundle (configured via vercel.json `includeFiles`).
//
// Path is constrained to a hard allowlist (no traversal). Returns the
// raw bytes with text/plain content type.
//
// install.sh / install.ps1 fetch via this endpoint instead of raw
// /agent/<path> URLs.
const fs = require("node:fs");
const path = require("node:path");

const ALLOWED = new Set([
  "quote_agent.py",
  "runtime/__init__.py",
  "runtime/agent.py",
  "runtime/tools/__init__.py",
  "runtime/tools/_stubs.py",
  "runtime/tools/auto_quote.py",
  "runtime/tools/twilio_dial.py",
  "runtime/tools/draft_sms.py",
  "runtime/tools/draft_email.py",
  "runtime/tools/sendblue_send.py",
  "runtime/tools/fathom_pull_notes.py",
  "runtime/tools/linkedin_send.py",
  "runtime/tools/linkedin_inbox_scan.py",
  "runtime/tools/fb_pull_lead_forms.py",
  "runtime/tools/ig_dm_reply.py",
  "runtime/tools/meta_dm_send.py",
  "runtime/tools/script_review.py",
  "runtime/tools/file_review.py",
  "runtime/tools/browser_run.py",
  "runtime/tools/create_lead.py",
  "scrapers/__init__.py",
  "scrapers/_template.py",
  "scrapers/aetna.py",
  "scrapers/aig.py",
  "scrapers/americanamicable.py",
  "scrapers/cigna.py",
  "scrapers/ethos.py",
  "scrapers/fg.py",
  "scrapers/foresters.py",
  "scrapers/humana.py",
  "scrapers/instabrain.py",
  "scrapers/lumico.py",
  "scrapers/moo.py",
  "scrapers/sbli.py",
  "scrapers/transamerica.py",
  "scrapers/uhc.py",
]);

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const rel = (url.searchParams.get("path") || "").trim();
  if (!ALLOWED.has(rel)) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: "path not allowlisted", path: rel }));
  }
  // process.cwd() is the deploy root in Vercel.
  const candidates = [
    path.resolve(process.cwd(), "agent", rel),
    path.resolve(__dirname, "..", "..", "agent", rel),
    path.resolve(__dirname, "..", "..", "..", "agent", rel),
  ];
  let buf, found;
  for (const p of candidates) {
    try { buf = fs.readFileSync(p); found = p; break; } catch {}
  }
  if (!buf) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: "file missing in deploy bundle", tried: candidates }));
  }
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=300, s-maxage=300");
  res.end(buf);
};
