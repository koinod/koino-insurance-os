#!/usr/bin/env node
// scripts/audit-50-states-life.mjs
// Audits all 50 states for their main Life Insurance exam:
// 1. Exam Vendor & Candidate Handbook URL
// 2. Content Outline & Domains
// 3. Question bank count in Supabase
// 4. Identifies gaps across all 50 states

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
const statesObj = licensingData.states || {};

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

async function runAudit() {
  const qCounts = await getQuestionCounts();
  const stateCodes = Object.keys(statesObj).sort();

  console.log(`\n================================================================================`);
  console.log(`50-STATE LIFE INSURANCE EXAM AUDIT REPORT (${new Date().toISOString().slice(0, 10)})`);
  console.log(`================================================================================\n`);

  const results = [];
  let totalReady = 0;

  for (const sc of stateCodes) {
    const sData = statesObj[sc];
    const varieties = sData?.exam_varieties || [];
    // Find primary life variety
    const lifeVariety = varieties.find(v => (v.applies_to_lines || []).includes("life")) || varieties[0];

    if (!lifeVariety) {
      results.push({ state: sc, status: "MISSING_VARIETY", details: "No life variety defined" });
      continue;
    }

    const key = `${sc}:${lifeVariety.id}`;
    const qCount = qCounts[key] || 0;
    const hasHandbook = !!lifeVariety.candidate_handbook_url;
    const vendor = lifeVariety.exam_vendor || "Unknown";
    const outline = lifeVariety.content_outline || [];
    const domainCount = outline.length;
    const hasTopics = outline.some(d => Array.isArray(d.topics) && d.topics.length > 0);

    const issues = [];
    if (!hasHandbook) issues.push("Missing handbook URL");
    if (domainCount === 0) issues.push("Missing content outline");
    if (!hasTopics) issues.push("Outline missing sub-topics");
    if (qCount < 200) issues.push(`Question bank count (${qCount}/200)`);

    const isReady = issues.length === 0;
    if (isReady) totalReady++;

    results.push({
      state: sc,
      name: sData.name || sc,
      varietyId: lifeVariety.id,
      varietyName: lifeVariety.name,
      vendor,
      questionCount: lifeVariety.question_count || "N/A",
      timeMins: lifeVariety.time_minutes || "N/A",
      passPct: lifeVariety.passing_score_pct || "N/A",
      hasHandbook,
      handbookUrl: lifeVariety.candidate_handbook_url || null,
      domainCount,
      qCount,
      isReady,
      issues
    });
  }

  // Print Summary Table
  console.log(`STATE | VENDOR       | QUESTIONS | HANDBOOK | DOMAINS | BANK Qs | STATUS`);
  console.log(`------|--------------|-----------|----------|---------|---------|-------------------`);
  for (const r of results) {
    const status = r.isReady ? "✅ READY" : `⚠️ ${r.issues.join(", ")}`;
    const hb = r.hasHandbook ? "YES" : "NO ";
    console.log(
      `${r.state.padEnd(5)} | ${r.vendor.slice(0, 12).padEnd(12)} | ${(r.questionCount + "q").padEnd(9)} | ${hb.padEnd(8)} | ${String(r.domainCount).padEnd(7)} | ${String(r.qCount).padEnd(7)} | ${status}`
    );
  }

  console.log(`\n================================================================================`);
  console.log(`AUDIT SUMMARY: ${totalReady} / ${results.length} states are 100% READY with handbook, full outline, and 200+ questions.`);
  console.log(`================================================================================\n`);

  // Write detailed output to JSON for consumption by seed script
  const scratchDir = path.join(ROOT, "scratch");
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(path.join(scratchDir, "audit_results.json"), JSON.stringify(results, null, 2));
}

runAudit();
