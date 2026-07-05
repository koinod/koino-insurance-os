#!/usr/bin/env node
// scripts/verify-50-states-integrity.mjs
// Automated integrity check for all 51 states:
// 1. Data Integrity: licensing-data.json structure, links, handbooks, outline domains
// 2. Study Guide Sync: verifies getStaticGuideSection returns non-null section for 100% of domains
// 3. Question Bank Sync: queries Supabase licensing_questions for per-state coverage

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load env
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const l of lines) {
    const m = l.match(/^([A-Z_]+)=["']?(.+?)["']?\s*$/);
    if (m) process.env[m[1]] = process.env[m[1]] || m[2];
  }
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

const licensingData = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/licensing-data.json"), "utf8"));

// Import licensing-study-guides module
const { getStaticGuideSection } = await import(path.join(ROOT, "lib/licensing-study-guides.js"));

async function getQuestionCounts() {
  try {
    const counts = {};
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const url = `${SUPA_URL}/rest/v1/licensing_questions?select=state_code,variety_id&offset=${page * pageSize}&limit=${pageSize}`;
      const res = await fetch(url, { headers: { apikey: SUPA_ANON, authorization: `Bearer ${SUPA_ANON}` } });
      if (!res.ok) break;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        hasMore = false;
        break;
      }
      for (const r of rows) {
        const key = `${r.state_code}:${r.variety_id}`;
        counts[key] = (counts[key] || 0) + 1;
      }
      if (rows.length < pageSize) hasMore = false;
      page++;
    }
    return counts;
  } catch (e) {
    console.error("Failed to fetch counts from Supabase:", e.message);
    return {};
  }
}

async function runIntegrityAudit() {
  const qCounts = await getQuestionCounts();
  const statesObj = licensingData.states || {};
  const stateCodes = Object.keys(statesObj).sort();

  console.log(`\n================================================================================`);
  console.log(`50-STATE INTEGRITY & ANTI-HALLUCINATION AUDIT (${new Date().toISOString().slice(0, 10)})`);
  console.log(`================================================================================\n`);

  let totalStates = 0;
  let totalPassed = 0;
  let totalDomainsTested = 0;
  let totalDomainsMatched = 0;

  for (const sc of stateCodes) {
    totalStates++;
    const sData = statesObj[sc];
    const varieties = sData?.exam_varieties || [];
    const lifeVariety = varieties.find(v => (v.applies_to_lines || []).includes("life")) || varieties[0];

    if (!lifeVariety) {
      console.log(`❌ ${sc}: Missing primary Life variety`);
      continue;
    }

    const key = `${sc}:${lifeVariety.id}`;
    const qCount = qCounts[key] || 0;
    const handbookUrl = lifeVariety.candidate_handbook_url;
    const vendor = lifeVariety.exam_vendor || "Unknown";
    const outline = lifeVariety.content_outline || [];

    // Verify each domain maps to a valid static study guide
    let domainSyncErrors = 0;
    for (const d of outline) {
      totalDomainsTested++;
      const guideSection = getStaticGuideSection("life", d.domain, sc, lifeVariety.id);
      if (!guideSection || !guideSection.blocks || guideSection.blocks.length === 0) {
        domainSyncErrors++;
        console.log(`  ❌ ${sc} domain desync: "${d.domain}" returned null guide`);
      } else {
        totalDomainsMatched++;
      }
    }

    const errors = [];
    if (!handbookUrl) errors.push("Missing Handbook URL");
    if (outline.length < 4) errors.push(`Insufficient Domains (${outline.length})`);
    if (domainSyncErrors > 0) errors.push(`Guide Desync (${domainSyncErrors} domains)`);
    if (qCount < 200) errors.push(`Question Bank Low (${qCount}/200)`);

    const passed = errors.length === 0;
    if (passed) totalPassed++;

    const statusStr = passed ? "✅ PASS 100%" : `⚠️ FAIL: ${errors.join(", ")}`;
    console.log(
      `${sc.padEnd(4)} | ${vendor.slice(0, 11).padEnd(11)} | Domains: ${String(outline.length).padEnd(2)} | Bank: ${String(qCount).padEnd(4)} | ${statusStr}`
    );
  }

  console.log(`\n================================================================================`);
  console.log(`INTEGRITY RESULTS: ${totalPassed} / ${totalStates} States PASSED 100%`);
  console.log(`STUDY GUIDE MATCH RATE: ${totalDomainsMatched} / ${totalDomainsTested} Domains Matched (${Math.round(100 * totalDomainsMatched / totalDomainsTested)}%)`);
  console.log(`================================================================================\n`);

  if (totalPassed < totalStates || totalDomainsMatched < totalDomainsTested) {
    process.exit(1);
  }
}

runIntegrityAudit().catch(e => {
  console.error("Integrity audit crashed:", e);
  process.exit(1);
});
