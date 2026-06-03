#!/usr/bin/env node
// scripts/seed-licensing-exam-varieties.mjs
//
// One-shot seeder: 2026-06-03 exam-variety research batch.
// Top 15 markets (TX FL CA GA NC PA OH IL MI AZ VA NY NJ TN MO) →
// 33 Life-touching exam varieties with question_count / time / passing_score /
// content_outline (weighted by domain per the official candidate handbook).
//
// Source: state-DOI / Pearson VUE / PSI candidate-handbook PDFs cited per
// variety in source_url / source_quote.
//
// Reads the agent's pre-built JSON from /tmp/exam_varieties.json. Writes
// states[CODE].exam_varieties and states[CODE].exam_meta into
// lib/licensing-data.json.
//
// Each variety gets an `applies_to_lines` array so the page-licensing.jsx
// picker filters correctly when the rep flips the line chip. We derive
// applies_to_lines from the variety NAME so we don't need the agent to
// annotate every entry.

import fs from "node:fs";

const JSON_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const SRC_PATH  = "/tmp/exam_varieties.json";

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
const src  = JSON.parse(fs.readFileSync(SRC_PATH,  "utf-8"));

function appliesToLinesFromName(name) {
  const n = String(name || "").toLowerCase();
  const out = new Set();
  // The substring tests below are intentionally broad.
  if (/life|funeral|burial|counselor/.test(n)) out.add("life");
  if (/health|accident|sickness|a\s*&\s*h|disability/.test(n)) out.add("health");
  if (/annuit/.test(n)) out.add("annuity");
  // Mortgage protection is a Life marketing label — always include life if it appears.
  if (/mortgage/.test(n)) { out.add("life"); out.add("mortgage_protection"); }
  // Default — if name doesn't obviously match, fall back to ["life"] since this batch
  // was scoped to Life-touching varieties.
  if (out.size === 0) out.add("life");
  return Array.from(out);
}

let touchedStates = 0;
let touchedVarieties = 0;
for (const code of Object.keys(data.states)) {
  const block = src[code];
  if (!block || !Array.isArray(block.exam_varieties)) continue;
  const varieties = block.exam_varieties.map(v => ({
    ...v,
    applies_to_lines: appliesToLinesFromName(v.name),
  }));
  data.states[code].exam_varieties = varieties;
  data.states[code].exam_meta = {
    exam_vendor_primary:        block.exam_vendor_primary || null,
    state_doi_handbook_url:     block.state_doi_handbook_url || null,
    state_content_outline_url:  block.state_content_outline_url || null,
    state_doi_page:             block.state_doi_page || null,
  };
  touchedStates++;
  touchedVarieties += varieties.length;
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`Seeded exam_varieties for ${touchedStates} states · ${touchedVarieties} varieties total. Source: 2026-06-03 candidate-handbook batch.`);
