#!/usr/bin/env node
// scripts/generate-study-guides.mjs
//
// Batch generator: walks data.states[*].exam_varieties, calls the live
// /api/licensing-tutor mode=study_guide for each (state, variety, section),
// upserts the result into public.licensing_guide_sections so the page can
// serve cached content instantly without paying the LLM cost per click.
//
// Usage:
//   node scripts/generate-study-guides.mjs                 # all curated varieties (skips synthesized)
//   node scripts/generate-study-guides.mjs --state TX      # one state only
//   node scripts/generate-study-guides.mjs --state TX --variety tx_life_agent
//   node scripts/generate-study-guides.mjs --skip-existing # don't regenerate sections already in DB
//
// Requires .env.local with SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import process from "node:process";

const ENV_PATH = new URL("../.env.local", import.meta.url);
loadEnv(ENV_PATH);

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SUPA_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_SRV) { console.error("missing SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

const TUTOR_URL  = process.env.LICENSING_TUTOR_URL || "https://repflow.koino.capital/api/licensing-tutor";
const DATA_PATH  = new URL("../lib/licensing-data.json", import.meta.url);
const data       = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i+1] : null; };
const has  = (k) => args.includes(k);
const ONLY_STATE   = flag("--state");
const ONLY_VARIETY = flag("--variety");
const SKIP_EXISTING = has("--skip-existing");

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  const txt = fs.readFileSync(path, "utf-8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function dbSelect(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_SRV, authorization: `Bearer ${SUPA_SRV}` }
  });
  if (!r.ok) throw new Error(`select ${path}: HTTP ${r.status} — ${(await r.text()).slice(0,200)}`);
  return r.json();
}
async function dbUpsert(table, row, conflictCols) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflictCols}`, {
    method: "POST",
    headers: {
      apikey: SUPA_SRV, authorization: `Bearer ${SUPA_SRV}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`upsert ${table}: HTTP ${r.status} — ${(await r.text()).slice(0,200)}`);
}

async function callTutor(body, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(TUTOR_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (r.ok && j && Array.isArray(j.blocks)) return j;
      if (attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
      throw new Error(`tutor ${r.status}: ${(j?.error || JSON.stringify(j).slice(0,200))}`);
    } catch (e) {
      if (attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

function buildSectionList(variety) {
  const outline = Array.isArray(variety.content_outline) ? variety.content_outline : [];
  const sections = outline.map((d, i) => ({
    section_number: pad2(i + 1),
    domain: d.domain,
    weight_pct: d.weight_pct,
    topics: d.topics,
  }));
  sections.push({
    section_number: "M",
    domain: "Master Numbers Drill",
    weight_pct: null,
    topics: ["Every testable number — time periods, fees, percentages, claims windows"],
  });
  return sections;
}

async function existingKeys(stateCode, varietyId) {
  const filters = [
    `state_code=eq.${stateCode}`,
    `variety_id=eq.${encodeURIComponent(varietyId)}`,
    "select=section_number",
  ].join("&");
  const rows = await dbSelect(`licensing_guide_sections?${filters}`);
  return new Set(rows.map(r => r.section_number));
}

let written = 0;
let skipped = 0;
let failed  = 0;

for (const [stateCode, stateRec] of Object.entries(data.states)) {
  if (ONLY_STATE && stateCode !== ONLY_STATE) continue;
  const varieties = Array.isArray(stateRec.exam_varieties) ? stateRec.exam_varieties : [];
  if (varieties.length === 0) continue;
  for (const variety of varieties) {
    if (ONLY_VARIETY && variety.id !== ONLY_VARIETY) continue;
    const sections = buildSectionList(variety);
    if (sections.length <= 1) continue; // no content outline → only the Master Numbers Drill; skip
    const existing = SKIP_EXISTING ? await existingKeys(stateCode, variety.id) : new Set();
    console.log(`[${stateCode}] ${variety.id} — ${sections.length} sections (${existing.size} already in DB)`);
    for (const section of sections) {
      if (SKIP_EXISTING && existing.has(section.section_number)) { skipped++; continue; }
      try {
        const resp = await callTutor({
          mode: "study_guide",
          state: stateCode,
          line: (variety.applies_to_lines && variety.applies_to_lines[0]) || "life",
          variety_id: variety.id,
          variety_name: variety.name,
          domain: section.domain,
          weight_pct: section.weight_pct,
          topics: section.topics,
          section_number: section.section_number,
        });
        const { source, model, ms, ...sectionDoc } = resp;
        await dbUpsert(
          "licensing_guide_sections",
          {
            state_code:     stateCode,
            variety_id:     variety.id,
            section_number: section.section_number,
            domain:         section.domain,
            weight_pct:     section.weight_pct,
            section_doc:    sectionDoc,
            model:          model || null,
            generated_at:   new Date().toISOString(),
          },
          "state_code,variety_id,section_number"
        );
        written++;
        process.stdout.write(`  ${section.section_number} ${section.domain.slice(0, 32)}… ✓\n`);
        await sleep(500);
      } catch (e) {
        failed++;
        process.stderr.write(`  ${section.section_number} ${section.domain.slice(0, 32)}… ✗ ${e.message}\n`);
        await sleep(2000);
      }
    }
  }
}

console.log(`\nDone. written=${written} skipped=${skipped} failed=${failed}`);
