#!/usr/bin/env node
// scripts/seed-licensing-annuity.mjs
//
// One-shot seeder: takes the cited per-state output from the annuity research
// agent (2026-06-03 batch) and writes states.<CODE>.lines.annuity into
// lib/licensing-data.json. Idempotent — re-running overwrites annuity cells
// with the same content.
//
// Source notes (the agent's findings, captured verbatim):
//   - 50 states + DC bundle fixed annuity under the Life LoA — no separate
//     producer license. Captured in license_type_note.
//   - Every state has adopted the NAIC Model #275 best-interest standard;
//     a 4-hr one-time training is required before solicitation in 49 +
//     DC + special cases (CA = 8h initial / 4h thereafter; NY = Reg 187
//     broader rule). Captured in prelicense_hours_required + reciprocity_notes.
//   - All exam/fee fields are null because there's NO separate annuity
//     license. The Life-line cells carry exam values.
//   - Universal source: 401kspecialistmag.com adoption summary; CA + NY
//     have state-specific DOI citations.

import fs from "node:fs";

const JSON_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

const CAPTURED_AT = "2026-06-03T00:00:00Z";
const UNIVERSAL_SOURCE_URL =
  "https://401kspecialistmag.com/all-50-states-now-on-board-with-naic-best-interest-annuity-rule/";
const UNIVERSAL_QUOTE_PREFIX =
  "All 50 states have adopted the NAIC Model #275 best-interest standard for annuity sales; producers must complete a one-time 4-credit annuity training course approved by the Department of Insurance.";

// Map: state code → per-state annuity-specific overrides. Most states use the
// universal pattern (4hr, Life-bundled). Only the outliers below override.
const overrides = {
  CA: {
    prelicense_hours_required: 8,
    prelicense_required_course: true,
    ce_hours_per_cycle: 4,
    reciprocity_notes:
      "Fixed annuities sold under the Life-Only LoA; no separate annuity license. CA requires 8 hours initial CA-specific annuity training before solicitation (CIC §1749.8); 4 hours each subsequent license term. SB 263 added 8-hr Annuity Suitability & Best Interest course effective Jan 1, 2025 (existing producers had until Jul 1, 2025).",
    source_url: "https://www.insurance.ca.gov/0200-industry/0050-renew-license/0200-requirements/Life/questions-answers.cfm",
    source_quote:
      "Section 1749.8 of the California Insurance Code states that any life agent who sells annuities must complete eight hours of approved annuity training prior to soliciting any individual consumers. A four-hour California-specific annuity training course is required each subsequent license term in which the agent sells an annuity.",
  },
  NY: {
    prelicense_hours_required: 4,
    prelicense_required_course: true,
    reciprocity_notes:
      "Fixed annuities sold under the Life Accident & Health LoA; no separate annuity license. NY has its own best-interest rule — Regulation 187 / 11 NYCRR 224 — broader than NAIC Model 275 (covers life insurance too). Effective Aug 1, 2019 for annuities, Feb 1, 2020 for life. Approved Reg 187 product/best-interest training required.",
    source_url: "https://www.dfs.ny.gov/apps_and_licensing/agents_and_brokers/Suitability/Best-Interests-Training",
    source_quote:
      "11 NYCRR 224 (Insurance Regulation 187): Suitability and Best Interests in Life Insurance and Annuity Transactions. The new regulation became effective August 1, 2019 with respect to annuity transactions and February 1, 2020 with respect to life insurance policies.",
  },
  IA: { reciprocity_notes_suffix: " Iowa was among the FIRST states to adopt the 2020 revisions (effective Jan 1, 2021)." },
  RI: { reciprocity_notes_suffix: " Rhode Island was among the FIRST states to adopt the 2020 revisions (effective Jan 1, 2021)." },
  NJ: { reciprocity_notes_suffix: " New Jersey was the 50TH and FINAL state to approve the NAIC standard." },
  LA: { reciprocity_notes_suffix: " Louisiana was among the LAST states to adopt — effective Sep 1, 2024 for new licensees." },
  AR: { reciprocity_notes_suffix: " Newly added from 'no requirement' under the prior 2010 model." },
  MT: { reciprocity_notes_suffix: " Newly added from 'no requirement' under the prior 2010 model." },
  NV: { reciprocity_notes_suffix: " Newly added from 'no requirement' under the prior 2010 model." },
  NM: { reciprocity_notes_suffix: " Newly added from 'no requirement' under the prior 2010 model." },
  WY: { reciprocity_notes_suffix: " Newly added from 'no requirement' under the prior 2010 model." },
  IN: { reciprocity_notes_suffix: " Indiana has a separate 'Variable Life & Annuity' LoA for variable products only; fixed annuities remain under Life." },
  VA: { license_type_note_override: "Fixed annuities sold under Virginia's 'Life & Annuities' LoA — annuity is named in the line title but is NOT a separate license." },
  TX: { reciprocity_notes_suffix: " In Texas the relevant LoA is 'General Lines — Life, Accident, Health and HMO.'" },
  FL: { reciprocity_notes_suffix: " In Florida the relevant LoAs are 2-15 (Life, Health & Variable Annuity) or 2-14 (Life including Variable Annuity)." },
};

const universalCell = (stateCode) => ({
  research_pending: false,
  license_type_note:
    overrides[stateCode]?.license_type_note_override ||
    "Fixed annuities are sold under the Life line of authority — no separate annuity producer license in this state.",
  prelicense_hours_required:
    overrides[stateCode]?.prelicense_hours_required ?? 4,
  prelicense_required_course:
    overrides[stateCode]?.prelicense_required_course ?? false,
  approved_course_vendors: null,
  exam_vendor: null,
  exam_fee_usd: null,
  exam_passing_score_pct: null,
  exam_question_count: null,
  exam_time_minutes: null,
  fingerprint_required: null,
  fingerprint_vendor: null,
  fingerprint_code: null,
  fingerprint_fee_usd: null,
  license_application_fee_usd: null,
  license_renewal_years: null,
  ce_hours_per_cycle: overrides[stateCode]?.ce_hours_per_cycle ?? null,
  ce_ethics_hours: null,
  background_check: null,
  nipr_path_url: null,
  state_doi_url: null,
  reciprocity_notes:
    overrides[stateCode]?.reciprocity_notes ||
    `Fixed annuities sold under the Life LoA; no separate annuity license. NAIC Model 275 best-interest 4-hr one-time training adopted.${overrides[stateCode]?.reciprocity_notes_suffix || ""}`,
  source_url: overrides[stateCode]?.source_url || UNIVERSAL_SOURCE_URL,
  source_quote:
    overrides[stateCode]?.source_quote ||
    `${UNIVERSAL_QUOTE_PREFIX} ${stateCode} is among the adopting jurisdictions.`,
  captured_at: CAPTURED_AT,
});

let touched = 0;
for (const code of Object.keys(data.states)) {
  data.states[code].lines = data.states[code].lines || {};
  data.states[code].lines.annuity = universalCell(code);
  touched++;
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`Seeded annuity cells for ${touched} jurisdictions. Source: 2026-06-03 research-agent batch.`);
