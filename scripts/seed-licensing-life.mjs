#!/usr/bin/env node
// scripts/seed-licensing-life.mjs
//
// One-shot seeder: 2026-06-03 Life-line research batch (NIPR-aggregator pattern).
// Same shape and citation discipline as the Health batch. Georgia is the only
// research_pending cell — GA doesn't route through NIPR and the oci.georgia.gov
// landing page doesn't surface Life fee/fingerprint specifics; flagged with reason.
//
// Reads the agent's pre-built JSON from /tmp/life_out.json and writes
// states[CODE].lines.life into lib/licensing-data.json.

import fs from "node:fs";

const JSON_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const SRC_PATH  = "/tmp/life_out.json";

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
const src  = JSON.parse(fs.readFileSync(SRC_PATH,  "utf-8"));

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
  for (const k of SCHEMA_FIELDS) out[k] = (k in agentCell) ? agentCell[k] : null;
  return out;
}

let touched = 0;
for (const code of Object.keys(data.states)) {
  if (!src[code]) continue;
  data.states[code].lines = data.states[code].lines || {};
  data.states[code].lines.life = normalize(src[code]);
  touched++;
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`Seeded life cells for ${touched} jurisdictions. Source: 2026-06-03 NIPR batch.`);
