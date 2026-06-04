#!/usr/bin/env node
// scripts/dedupe-exam-varieties.mjs
//
// Different research batches sometimes wrote different IDs for the SAME
// underlying exam (e.g. VA's original batch used `va_series_1105_*` while
// the gap-fill batch used `va_life_annuities` for the same Series 11-05
// exam). After running all the per-batch merges, run this once to collapse
// near-duplicates: same state, same series number (digits-only match) — keep
// the variety with content_outline (or the richer one if both have).

import fs from "node:fs";
const JSON_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

function seriesDigits(s) {
  if (!s) return null;
  // Strip dashes/spaces so "11-05" matches "1105", then take the first digit run
  // so "11-05 (filename 1105)" becomes "1105".
  const cleaned = String(s).replace(/[\s\-_]/g, "");
  const m = cleaned.match(/(\d{3,5})/);
  return m ? m[1] : null;
}

function score(v) {
  let s = 0;
  if (Array.isArray(v.content_outline) && v.content_outline.length > 0) s += 1000 + v.content_outline.length;
  if (v.question_count) s += 10;
  if (v.time_minutes) s += 10;
  if (v.exam_fee_usd) s += 5;
  if (v.candidate_handbook_url) s += 5;
  if (v.source_quote) s += String(v.source_quote).length / 100;
  return s;
}

let removed = 0;
for (const [code, rec] of Object.entries(data.states)) {
  const vs = Array.isArray(rec.exam_varieties) ? rec.exam_varieties : [];
  if (vs.length < 2) continue;

  const groups = new Map();
  const ungrouped = [];
  for (const v of vs) {
    const k = seriesDigits(v.series_code);
    if (!k) { ungrouped.push(v); continue; }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }

  let kept = [...ungrouped];
  for (const [k, group] of groups) {
    if (group.length === 1) { kept.push(group[0]); continue; }
    // Choose the highest-scoring variety for this series-digit group.
    group.sort((a, b) => score(b) - score(a));
    kept.push(group[0]);
    const dropped = group.slice(1);
    removed += dropped.length;
    console.log(`[${code}] series digits ${k}: kept ${group[0].id} (${group[0].name.slice(0,40)}), dropped ${dropped.map(d => d.id).join(", ")}`);
  }

  // Stricter second pass: collapse near-duplicates ONLY when the
  // normalized names are EQUAL after stripping punctuation/whitespace.
  // Substring containment is NOT enough — that would falsely merge
  // "NH Laws & Regulations Life" with "NH Laws & Regulations Life and A&H"
  // which are actually different exams (Series 12-78 vs 12-80).
  const byNormName = new Map();
  for (const v of kept) {
    const norm = String(v.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!byNormName.has(norm)) byNormName.set(norm, []);
    byNormName.get(norm).push(v);
  }
  const finalKept = [];
  for (const [norm, group] of byNormName) {
    if (group.length === 1) { finalKept.push(group[0]); continue; }
    group.sort((a, b) => score(b) - score(a));
    finalKept.push(group[0]);
    removed += group.length - 1;
    console.log(`[${code}] same-name dedup: kept ${group[0].id} (${group[0].name.slice(0,40)}), dropped ${group.slice(1).map(x => x.id).join(", ")}`);
  }

  data.states[code].exam_varieties = finalKept;
}

// One-off corrections for known wrong-series-code mistakes from the original batch
// that survive both passes because their names are too different to match.
const KNOWN_BAD_IDS = [
  // VA: original batch labeled the combined L+H+A exam as "Series 1107", but VA's
  // actual code is 11-01. The gap-fill captured 11-01 correctly under
  // `va_life_annuities_health`. Drop the 1107-labeled stub.
  ["VA", "va_series_1107_life_annuities_health"],
  // CA: original batch stub'd two "combined L+A&H" entries, but per CDI there is
  // NO single combined exam in California — applicants pass both Life-Only and
  // Accident & Health exams separately. Drop the stubs.
  ["CA", "ca_life_accident_health"],
  ["CA", "ca_life_and_ah_combined"],
  // CA: two stubs for Funeral/Burial — the gap-fill captured the canonical one
  // with outline (ca_life_funeral_burial). Drop the no-outline duplicate.
  ["CA", "ca_life_limited_funeral_burial"],
];
for (const [code, badId] of KNOWN_BAD_IDS) {
  const rec = data.states[code];
  if (!rec || !Array.isArray(rec.exam_varieties)) continue;
  const before = rec.exam_varieties.length;
  rec.exam_varieties = rec.exam_varieties.filter(v => v.id !== badId);
  if (rec.exam_varieties.length < before) {
    removed++;
    console.log(`[${code}] dropped known-bad id ${badId}`);
  }
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`\nDone. Removed ${removed} duplicate varieties across all states.`);
