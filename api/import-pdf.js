// /api/import-pdf — extract plaintext from a PDF so managers can create
// call scripts from uploaded PDFs or public PDF URLs.
//
// Request:
//   multipart/form-data with `file` (preferred) or `url`
// Response:
//   { ok: true, title, text, pages, originalUrl? }
//
// This runs in the edge runtime to match the rest of the import endpoints.

// This runs in the Node runtime because pdfjs-dist requires Node.js modules.

const HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 200;

function err(status, msg) {
  return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: HEADERS });
}

function titleFromSource(source) {
  const s = String(source || "").split("?")[0].split("#")[0];
  const file = s.split("/").filter(Boolean).pop() || "";
  const stem = file.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
  return stem ? stem.replace(/\b\w/g, (c) => c.toUpperCase()) : "Imported PDF";
}

async function extractPdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const pages = Math.min(pdf.numPages || 0, MAX_PAGES);
  const parts = [];

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items || [])
      .map((item) => item?.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(text);
  }

  let metaTitle = null;
  try {
    const meta = await pdf.getMetadata();
    metaTitle = meta?.info?.Title || null;
    if (typeof metaTitle === "string") {
      metaTitle = metaTitle.replace(/\s+/g, " ").trim();
      if (!metaTitle) metaTitle = null;
    }
  } catch {
    metaTitle = null;
  }

  const text = parts.join("\n\n");
  return { text, pages: pdf.numPages || pages, metaTitle };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== "POST") return err(405, "POST only");

  let form;
  try { form = await req.formData(); } catch { return err(400, "expected multipart/form-data"); }

  const file = form.get("file");
  const url = String(form.get("url") || "").trim();

  let sourceBytes = null;
  let originalUrl = null;
  let sourceName = null;

  if (file && typeof file !== "string") {
    if ((file.size || 0) === 0) return err(400, "empty file");
    if (file.size > MAX_BYTES) return err(413, `file too large (max ${MAX_BYTES} bytes)`);
    sourceBytes = await file.arrayBuffer();
    sourceName = file.name || "Imported PDF";
  } else if (url) {
    originalUrl = url;
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) return err(502, `fetch failed (${r.status})`);
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (ct && !ct.includes("pdf") && !ct.includes("octet-stream")) {
      return err(400, "url does not look like a PDF");
    }
    const blob = await r.blob();
    if (blob.size > MAX_BYTES) return err(413, `file too large (max ${MAX_BYTES} bytes)`);
    sourceBytes = await blob.arrayBuffer();
    sourceName = titleFromSource(url);
  } else {
    return err(400, "missing file or url");
  }

  try {
    const { text, pages, metaTitle } = await extractPdfText(sourceBytes);
    if (!text) return err(422, "no extractable text found in PDF");
    const title = metaTitle || titleFromSource(sourceName);
    const capped = text.length > 200_000 ? text.slice(0, 200_000) + "\n…[truncated]" : text;
    return new Response(JSON.stringify({
      ok: true,
      title,
      text: capped,
      pages,
      originalUrl,
    }), { status: 200, headers: HEADERS });
  } catch (e) {
    return err(422, e?.message || "pdf parse failed");
  }
}
