#!/usr/bin/env node
// scripts/seed-licensing-exam-varieties.mjs
//
// Generic exam-variety seeder. Reads ONE source JSON and merges its
// states[CODE].exam_varieties into lib/licensing-data.json. Designed to
// be run multiple times — once per research batch (top-15, tier-2,
// tier-3, gap-fill).
//
// Merge semantics PER STATE:
//   - Existing varieties whose id ALSO appears in the source: replaced
//     (so a gap-fill batch can refresh CA's outlines).
//   - Existing varieties whose id is NOT in the source: kept.
//   - Source varieties whose id is NOT in target: appended.
//
// Usage:
//   node scripts/seed-licensing-exam-varieties.mjs --src /tmp/exam_varieties.json
//   node scripts/seed-licensing-exam-varieties.mjs --src /tmp/exam_varieties_t2.json
//   node scripts/seed-licensing-exam-varieties.mjs --src /tmp/exam_varieties_t3.json
//   node scripts/seed-licensing-exam-varieties.mjs --src /tmp/exam_varieties_gapfill.json

import fs from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i+1] : null; };
const SRC_PATH = flag("--src") || "/tmp/exam_varieties.json";

const JSON_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
const src  = JSON.parse(fs.readFileSync(SRC_PATH,  "utf-8"));

function appliesToLinesFromName(name) {
  const n = String(name || "").toLowerCase();
  const out = new Set();
  if (/life|funeral|burial|counselor/.test(n)) out.add("life");
  if (/health|accident|sickness|a\s*&\s*h|disability/.test(n)) out.add("health");
  if (/annuit/.test(n)) out.add("annuity");
  if (/mortgage/.test(n)) { out.add("life"); out.add("mortgage_protection"); }
  if (out.size === 0) out.add("life");
  return Array.from(out);
}

function normalize(v) {
  return { ...v, applies_to_lines: v.applies_to_lines || appliesToLinesFromName(v.name) };
}

let states = 0, addedVarieties = 0, replacedVarieties = 0;

for (const code of Object.keys(data.states)) {
  const block = src[code];
  if (!block || !Array.isArray(block.exam_varieties)) continue;

  const existing = Array.isArray(data.states[code].exam_varieties) ? data.states[code].exam_varieties : [];
  const existingById = new Map(existing.map(v => [v.id, v]));

  for (const v of block.exam_varieties) {
    if (existingById.has(v.id)) {
      existingById.set(v.id, normalize(v));
      replacedVarieties++;
    } else {
      existingById.set(v.id, normalize(v));
      addedVarieties++;
    }
  }

  data.states[code].exam_varieties = Array.from(existingById.values());
  // Merge state-level exam_meta (don't overwrite if source omits a field).
  data.states[code].exam_meta = {
    ...(data.states[code].exam_meta || {}),
    exam_vendor_primary:       block.exam_vendor_primary       ?? data.states[code].exam_meta?.exam_vendor_primary       ?? null,
    state_doi_handbook_url:    block.state_doi_handbook_url    ?? data.states[code].exam_meta?.state_doi_handbook_url    ?? null,
    state_content_outline_url: block.state_content_outline_url ?? data.states[code].exam_meta?.state_content_outline_url ?? null,
    state_doi_page:            block.state_doi_page            ?? data.states[code].exam_meta?.state_doi_page            ?? null,
  };
  states++;
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`[${SRC_PATH}] merged ${states} states · ${addedVarieties} added, ${replacedVarieties} replaced.`);
