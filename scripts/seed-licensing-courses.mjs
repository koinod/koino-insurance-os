#!/usr/bin/env node
// scripts/seed-licensing-courses.mjs
//
// One-shot seeder: takes the approved pre-licensing course providers
// research batch (2026-06-03) and writes states[CODE].approved_courses
// + states[CODE].pre_licensing_required into lib/licensing-data.json.
//
// Source: state DOI portals — Pearson VUE / PSI / Sircon / Prometric
// lookup tools where the DOI delegates, OR a direct DOI-hosted roster
// (NC, SC, MD, MI, CT, AL). Per-cell source_url + source_quote cite
// the actual DOI page.
//
// Reads /tmp/approved_courses.json.

import fs from "node:fs";

const JSON_PATH = new URL("../lib/licensing-data.json", import.meta.url);
const SRC_PATH  = "/tmp/approved_courses.json";

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
const src  = JSON.parse(fs.readFileSync(SRC_PATH,  "utf-8"));

let touched = 0;
let courseRows = 0;
let noLongerRequired = [];

for (const code of Object.keys(data.states)) {
  const block = src[code];
  if (!block) continue;
  data.states[code].course_meta = {
    doi_approved_providers_url: block.doi_approved_providers_url || null,
    lookup_tool_url:            block.lookup_tool_url || null,
    education_required:         block.education_required !== false,
    pre_licensing_notes:        block.pre_licensing_notes || null,
  };
  if (block.education_required === false) noLongerRequired.push(code);
  if (Array.isArray(block.courses)) {
    data.states[code].approved_courses = block.courses;
    courseRows += block.courses.length;
  }
  touched++;
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`Seeded approved-courses for ${touched} states · ${courseRows} provider rows total.`);
if (noLongerRequired.length) {
  console.log(`Pre-licensing NOT required in: ${noLongerRequired.join(" ")}`);
}
