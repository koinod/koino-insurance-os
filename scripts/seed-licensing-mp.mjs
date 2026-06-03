#!/usr/bin/env node
// scripts/seed-licensing-mp.mjs
//
// One-shot seeder: 2026-06-03 mortgage-protection batch.
//
// Source: NAIC Model 880 (Unfair Trade Practices Act) State Page —
//   https://content.naic.org/sites/default/files/model-law-state-page-880.pdf
//   Each cell's source_quote is the verbatim adoption-chart row for that
//   jurisdiction's UTPA citation. NAIC Model 880 §4.A.(5) and §4.B are the
//   subsections that govern "mortgage protection" naming/marketing — that's
//   what shapes marketing_rule_notes.
//
// All 51 jurisdictions covered; no research_pending fallback used. Reads the
// agent's pre-built JSON from /tmp/mp_out2.json and merges into
// states[CODE].lines.mortgage_protection in lib/licensing-data.json.

import fs from "node:fs";

const JSON_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const SRC_PATH  = "/tmp/mp_out2.json";

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
const src  = JSON.parse(fs.readFileSync(SRC_PATH,  "utf-8"));

// Full cell shape — fields the agent didn't populate get null.
const SCHEMA_FIELDS = [
  "research_pending","research_pending_reason",
  "prelicense_hours_required","prelicense_required_course","approved_course_vendors",
  "exam_vendor","exam_fee_usd","exam_passing_score_pct","exam_question_count","exam_time_minutes",
  "fingerprint_required","fingerprint_vendor","fingerprint_code","fingerprint_fee_usd",
  "license_application_fee_usd","license_renewal_years",
  "ce_hours_per_cycle","ce_ethics_hours","background_check",
  "nipr_path_url","state_doi_url","reciprocity_notes",
  "license_type_note","marketing_rule_notes","marketing_rule_statute",
  "source_url","source_quote","captured_at",
];

function normalize(agentCell) {
  const out = {};
  for (const k of SCHEMA_FIELDS) {
    out[k] = (k in agentCell) ? agentCell[k] : null;
  }
  return out;
}

let touched = 0;
for (const code of Object.keys(data.states)) {
  if (!src[code]) continue;
  data.states[code].lines = data.states[code].lines || {};
  data.states[code].lines.mortgage_protection = normalize(src[code]);
  touched++;
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`Seeded mortgage_protection cells for ${touched} jurisdictions. Source: 2026-06-03 NAIC Model 880 batch.`);
