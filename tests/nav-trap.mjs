// tests/nav-trap.mjs — Playwright walk that asserts the Coaching ↔ Team Board
// dead-end is gone (bug repro 2026-05-16).
//
// What we walk (as manager, in demo mode):
//   1. Home → Coaching (deep-link via window.gotoPage("coaching"))
//   2. Confirm the inner SectionPill exposing Floor / Coaching / NIGO /
//      Recruiting / Dispatch is VISIBLE (the previous bug hid it via
//      .training-embed → trapping the user with no way back to Team Board).
//   3. Click Floor in that pill → lands on Team Board (case=team).
//   4. From Team Board's own SectionPill click Coaching.
//   5. Confirm we're back on /coaching AND the SectionPill is still visible
//      AND the PageTraining "Call Coaching" tab is the active one (default
//      reset; not whichever tab the user last touched in /training).
//
// Run: npm run test:nav  (defaults to live; SMOKE_URL=… to point elsewhere).

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = (process.env.SMOKE_URL || "https://repflow.koino.capital").replace(/\/$/, "");
const ARTIFACT_DIR = "smoke-artifacts";
await mkdir(ARTIFACT_DIR, { recursive: true });

const passes = [], failures = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("[pageerror] " + (e.message || String(e))));

async function snap(name) {
  const p = join(ARTIFACT_DIR, `nav-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}
async function check(label, fn) {
  const t0 = Date.now();
  try { await fn(); passes.push({ label, ms: Date.now() - t0 }); console.log(`  ✓ ${label}  (${Date.now() - t0}ms)`); }
  catch (e) {
    const shot = await snap(label.replace(/\W+/g, "_"));
    failures.push({ label, err: String(e.message || e), shot });
    console.log(`  ✘ ${label}  — ${e.message || e}\n      shot: ${shot}`);
  }
}
async function setRole(r) {
  const btn = page.locator(`.role-switch button[title="${r}"]`).first();
  if (await btn.count() > 0) await btn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function goto(p) {
  await page.evaluate((t) => window.gotoPage && window.gotoPage(t), p);
  await page.waitForTimeout(700);
}

console.log(`nav-trap → ${BASE}/?demo=1`);
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await setRole("manager");

// Step 1+2: navigate to Coaching and confirm the inner SectionPill is visible.
await check("coaching-pill-visible-after-direct-nav", async () => {
  await goto("coaching");
  // The CoachingManager SectionPill has these items: Floor/Coaching/NIGO/Recruiting/Dispatch
  const floorPillBtn = page.getByRole("button", { name: /^Floor$/ });
  if ((await floorPillBtn.count()) === 0)
    throw new Error("Team Board return-pill (Floor button) not visible inside coaching");
});

// Step 3: click Floor → Team Board.
await check("coaching-to-team-board-via-pill", async () => {
  await page.getByRole("button", { name: /^Floor$/ }).first().click({ timeout: 3000 });
  await page.waitForTimeout(700);
  // Page title is a div.page-title, not a <h1>, so we match by class text.
  const teamTitle = await page.locator('.page-title').filter({ hasText: /Team Board/i }).count();
  if (teamTitle === 0) throw new Error("did not land on Team Board after clicking Floor");
});

// Step 4+5: from Team Board click Coaching → return safely, SectionPill still visible.
await check("team-board-back-to-coaching-no-trap", async () => {
  await page.getByRole("button", { name: /^Coaching$/ }).first().click({ timeout: 3000 });
  await page.waitForTimeout(900);
  // SectionPill must still be there — its existence proves no trap.
  const floorBack = await page.getByRole("button", { name: /^Floor$/ }).count();
  if (floorBack === 0)
    throw new Error("after returning to Coaching the SectionPill was suppressed (regression of the trap)");
  // And the PageTraining top tab should default to "Call Coaching", not whatever was clicked before.
  const callCoachingTab = await page.locator('.training-tabs button.active').filter({ hasText: /Call Coaching/i }).count();
  if (callCoachingTab === 0)
    throw new Error("PageTraining sub-tab did not reset to Call Coaching (stale state bleed)");
});

await ctx.close();
await browser.close();

await writeFile(join(ARTIFACT_DIR, "nav-trap-summary.json"),
  JSON.stringify({ base: BASE, ts: new Date().toISOString(), passes, failures }, null, 2));

console.log(`\n${failures.length === 0 ? "✓" : "✘"} ${passes.length} passed · ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f.label}: ${f.err}`);
  process.exit(1);
}
