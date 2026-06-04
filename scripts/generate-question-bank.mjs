#!/usr/bin/env node
// scripts/generate-question-bank.mjs
//
// Batch generator: for each (state, variety, domain) in data.states[*].exam_varieties,
// pre-generate N questions via the live /api/licensing-tutor mode=practice and
// insert into public.licensing_questions. The practice loop in page-licensing.jsx
// then samples from the bank (one cheap DB read) instead of paying the LLM cost
// per question.
//
// Usage:
//   node scripts/generate-question-bank.mjs                       # all curated varieties, default n=8
//   node scripts/generate-question-bank.mjs --state TX            # one state only
//   node scripts/generate-question-bank.mjs --state TX --n 12     # 12 per (variety, domain)
//
// Requires .env.local with SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import process from "node:process";

const ENV_PATH = new URL("../.env.local", import.meta.url);
loadEnv(ENV_PATH);

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SUPA_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_SRV) { console.error("missing SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

const TUTOR_URL = process.env.LICENSING_TUTOR_URL || "https://repflow.koino.capital/api/licensing-tutor";
const DATA_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const data      = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i+1] : null; };
const ONLY_STATE   = flag("--state");
const ONLY_VARIETY = flag("--variety");
const N_PER_DOMAIN = parseInt(flag("--n") || "8", 10);

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  const txt = fs.readFileSync(path, "utf-8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dbInsert(table, row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPA_SRV, authorization: `Bearer ${SUPA_SRV}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`insert ${table}: HTTP ${r.status} — ${(await r.text()).slice(0,200)}`);
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
      if (r.ok && j && typeof j.stem === "string" && Array.isArray(j.options) && j.options.length === 4) return j;
      if (attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
      throw new Error(`tutor ${r.status}: ${(j?.error || JSON.stringify(j).slice(0,200))}`);
    } catch (e) {
      if (attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

let written = 0, failed = 0;

for (const [stateCode, stateRec] of Object.entries(data.states)) {
  if (ONLY_STATE && stateCode !== ONLY_STATE) continue;
  const varieties = Array.isArray(stateRec.exam_varieties) ? stateRec.exam_varieties : [];
  if (varieties.length === 0) continue;
  for (const variety of varieties) {
    if (ONLY_VARIETY && variety.id !== ONLY_VARIETY) continue;
    const outline = Array.isArray(variety.content_outline) ? variety.content_outline : [];
    if (outline.length === 0) continue;
    console.log(`[${stateCode}] ${variety.id} — ${outline.length} domains × ${N_PER_DOMAIN} q`);
    for (const dom of outline) {
      for (let i = 0; i < N_PER_DOMAIN; i++) {
        try {
          // Bypass the bank lookup on the server: pass NO variety_id when
          // generating fresh items (otherwise the endpoint would return
          // existing rows from the bank we're trying to grow).
          const line = (variety.applies_to_lines && variety.applies_to_lines[0]) || "life";
          const q = await callTutor({
            mode: "practice",
            state: stateCode,
            line,
            domain: dom.domain,
            variety_name: variety.name,
            // No variety_id — forces a live gen instead of bank lookup.
          });
          await dbInsert("licensing_questions", {
            state_code:    stateCode,
            line,
            variety_id:    variety.id,
            domain:        dom.domain,
            stem:          q.stem,
            options:       q.options,
            correct_index: q.correct_index,
            explanation:   q.explanation || null,
            difficulty:    q.difficulty || null,
          });
          written++;
          process.stdout.write(`  ${dom.domain.slice(0,28)} #${i+1} ✓\n`);
          await sleep(400);
        } catch (e) {
          failed++;
          process.stderr.write(`  ${dom.domain.slice(0,28)} #${i+1} ✗ ${e.message}\n`);
          await sleep(2000);
        }
      }
    }
  }
}

console.log(`\nDone. written=${written} failed=${failed}`);
