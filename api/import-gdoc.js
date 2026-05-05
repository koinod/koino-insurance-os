// /api/import-gdoc — fetch a public Google Doc / Sheet / Slides export so the
// browser can embed it without hitting CORS. Returns title + plaintext body
// + the public export URL the UI can preview from.
//
// Body: { url: "https://docs.google.com/document/d/<id>/edit..." }
// Response (200): { ok: true, kind, docId, title, text, exportUrl, originalUrl }
// Response (4xx): { ok: false, error }
//
// Only works for docs/sheets/slides shared as "anyone with the link". Private
// docs return 401/404 from Google — surfaced back to the UI verbatim.
//
// FREE: no API key, just public export endpoints. Edge runtime keeps cost ~0.

export const config = { runtime: "edge" };

const HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

const PATTERNS = [
  { kind: "document",     re: /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,     export: (id) => `https://docs.google.com/document/d/${id}/export?format=txt` },
  { kind: "spreadsheet",  re: /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/, export: (id) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv` },
  { kind: "presentation", re: /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/, export: (id) => `https://docs.google.com/presentation/d/${id}/export/txt` },
];

function err(status, msg) {
  return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: HEADERS });
}

async function fetchTitle(originalUrl) {
  try {
    const r = await fetch(originalUrl, { redirect: "follow" });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/<title>([^<]+)<\/title>/i);
    if (!m) return null;
    return m[1].replace(/ - Google (Docs|Sheets|Slides)$/, "").trim();
  } catch { return null; }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== "POST")   return err(405, "POST only");

  let body;
  try { body = await req.json(); } catch { return err(400, "invalid JSON"); }
  const url = (body?.url || "").trim();
  if (!url) return err(400, "url required");

  const match = PATTERNS.map(p => ({ p, m: p.re.exec(url) })).find(x => x.m);
  if (!match) return err(400, "not a recognized Google Docs / Sheets / Slides URL");

  const docId = match.m[1];
  const exportUrl = match.p.export(docId);

  let text = "", title = null, fetchErr = null;
  try {
    const r = await fetch(exportUrl, { redirect: "follow" });
    if (r.ok) {
      text = await r.text();
      // Hard cap on body size to keep payload sensible
      if (text.length > 200_000) text = text.slice(0, 200_000) + "\n…[truncated]";
    } else if (r.status === 401 || r.status === 403) {
      fetchErr = "doc is not public — share as 'Anyone with the link' to import";
    } else if (r.status === 404) {
      fetchErr = "doc not found";
    } else {
      fetchErr = `Google returned ${r.status}`;
    }
  } catch (e) {
    fetchErr = "fetch failed: " + (e?.message || "unknown");
  }

  title = await fetchTitle(url);

  if (fetchErr && !text) return err(403, fetchErr);

  return new Response(JSON.stringify({
    ok: true,
    kind: match.p.kind,
    docId,
    title: title || `Google ${match.p.kind} (${docId.slice(0, 8)})`,
    text,
    exportUrl,
    originalUrl: url,
  }), { status: 200, headers: HEADERS });
}
