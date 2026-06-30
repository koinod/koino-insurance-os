// tests/smoke.mjs — Playwright smoke. Loads ?demo=1 (which skips auth and
// seeds the Atlas sandbox), iterates roles + every sidebar nav page,
// asserts:
//
//   1. No React error boundary triggered ("This panel hit an error.")
//   2. No console error matching Minified React / TypeError / ReferenceError
//   3. No "Could not find the function …" or "schema cache" Postgrest
//      error in console OR rendered as a visible banner. (This is the
//      class of failure that broke P&L on 2026-05-19 — frontend called
//      an RPC that was never applied to prod.)
//   4. Per-role sidebar has at least the minimum expected item count.
//      Catches NAV-strip regressions like the 2026-05-16 cull.
//
// Page list per role is read FROM the live window.Shared.NAV at runtime,
// so this stays in sync with the real sidebar automatically. No more
// hand-maintained PAGES_BY_ROLE going stale.
//
// Usage:
//   npx playwright install chromium     # one-time
//   npm run smoke                       # against repflow.koino.capital
//   SMOKE_URL=http://localhost:3000 npm run smoke

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = (process.env.SMOKE_URL || "https://repflow.koino.capital").replace(/\/$/, "");
const ARTIFACT_DIR = "smoke-artifacts";
await mkdir(ARTIFACT_DIR, { recursive: true });

// Minimum sidebar item count per role. If the live NAV ever drops below
// this, smoke fails. Tune in lockstep with shared.jsx::NAV.
const MIN_NAV_ITEMS = {
  rep:         6,
  manager:     8,
  // Super admin sidebar intentionally collapsed to HQ + Settings on 2026-05-25.
  // PageAdminHub hosts the previously separate admin sections.
  super_admin: 2,
};

// Console-error patterns that should fail the build. Keep narrow — the
// goal is high-signal regressions, not every noisy warning.
const FATAL_CONSOLE_RX = [
  /Minified React error/i,
  /TypeError/i,
  /ReferenceError/i,
  /Could not find the function/i,                // missing RPC
  /schema cache/i,                                // Postgrest schema-cache miss
  /PGRST\d+/i,                                    // Postgrest error codes
  /Failed to fetch.+supabase/i,                   // network to Supabase
];

// Visible-banner patterns. Some errors are caught and shown as a red
// banner instead of throwing — page-pnl does this for RPC failures.
const FATAL_BANNER_SELECTORS = [
  'text="This panel hit an error."',
  'text=/Could not find the function/i',
  'text=/schema cache/i',
];

const failures = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Intercept and abort fonts/posthog to avoid hanging on slow network requests inside sandbox
await page.route(url => {
  const urlStr = url.href;
  return urlStr.includes("fonts.googleapis.com") || urlStr.includes("fonts.gstatic.com") || urlStr.includes("posthog");
}, route => {
  route.abort();
});

let consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  if (/Failed to load resource/i.test(text)) return;
  if (/serviceWorker/i.test(text)) return;
  if (/Manifest:/i.test(text)) return;
  consoleErrors.push(text);
});
page.on("pageerror", (err) => consoleErrors.push("[pageerror] " + (err.message || String(err))));

console.log(`smoke → ${BASE}?demo=1`);
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Pull NAV directly from the live page so smoke stays in sync.
const NAV = await page.evaluate(() => {
  const n = (window.Shared && window.Shared.NAV) || {};
  const out = {};
  for (const role of ["rep", "manager", "super_admin"]) {
    out[role] = Array.isArray(n[role]) ? n[role].map(it => ({ id: it.id, label: it.label })) : [];
  }
  return out;
});

console.log("Live NAV:");
for (const [role, items] of Object.entries(NAV)) {
  console.log(`  ${role}: ${items.length} items — ${items.map(i => i.id).join(", ")}`);
}

for (const [role, min] of Object.entries(MIN_NAV_ITEMS)) {
  const count = (NAV[role] || []).length;
  if (count < min) {
    failures.push({
      where: `nav-shape/${role}`,
      reason: `sidebar has ${count} items, expected at least ${min}`,
      items: (NAV[role] || []).map(i => i.id),
    });
    console.log(`  ✘ nav-shape/${role}: ${count} < ${min} min items`);
  } else {
    console.log(`  ✓ nav-shape/${role}: ${count} items (≥${min})`);
  }
}

async function flipRole(role) {
  const btn = page.locator(`.role-switch button[title="${role}"]`).first();
  if (await btn.count() > 0) {
    await btn.click({ timeout: 3000 }).catch(() => {});
  } else {
    await page.evaluate(
      (r) => { try { localStorage.setItem("repflow.role", r); } catch {} },
      role,
    );
  }
  await page.waitForTimeout(500);
}

async function checkBanners() {
  for (const sel of FATAL_BANNER_SELECTORS) {
    const count = await page.locator(sel).count().catch(() => 0);
    if (count > 0) return sel;
  }
  return null;
}

for (const [role, items] of Object.entries(NAV)) {
  if (items.length === 0) continue;
  await flipRole(role);

  for (const item of items) {
    const p = item.id;
    consoleErrors = [];
    const start = Date.now();
    try {
      await page.evaluate((target) => window.gotoPage && window.gotoPage(target), p);
      await page.waitForTimeout(900);

      const banner = await checkBanners();
      const consoleHit = consoleErrors.find((e) => FATAL_CONSOLE_RX.some(rx => rx.test(e)));

      if (banner || consoleHit) {
        const safeName = `${role}_${p}_${Date.now()}.png`.replace(/[^a-z0-9._-]/gi, "_");
        await page.screenshot({ path: join(ARTIFACT_DIR, safeName), fullPage: false }).catch(() => {});
        failures.push({
          where: `${role}/${p}`,
          banner: banner || null,
          console: consoleErrors.slice(0, 5),
          screenshot: safeName,
          ms: Date.now() - start,
        });
        console.log(`  ✘ ${role}/${p}  (${banner ? "banner" : ""}${banner && consoleHit ? "+" : ""}${consoleHit ? "console" : ""}) → ${safeName}`);
      } else {
        console.log(`  ✓ ${role}/${p}  (${Date.now() - start}ms)`);
      }
    } catch (e) {
      failures.push({ where: `${role}/${p}`, thrown: String(e) });
      console.log(`  ✘ ${role}/${p}  thrown: ${e.message || e}`);
    }
  }
}

await ctx.close();
await browser.close();

const totalPageVisits = Object.values(NAV).reduce((sum, arr) => sum + arr.length, 0);
const summaryPath = join(ARTIFACT_DIR, "summary.json");
await writeFile(summaryPath, JSON.stringify({
  base: BASE,
  ts: new Date().toISOString(),
  nav_sizes: Object.fromEntries(Object.entries(NAV).map(([r, v]) => [r, v.length])),
  page_visits: totalPageVisits,
  failures,
}, null, 2));

if (failures.length > 0) {
  console.log(`\n✘ ${failures.length} failure(s). See ${summaryPath} + ${ARTIFACT_DIR}/*.png`);
  process.exit(1);
}
console.log(`\n✓ all clean across ${totalPageVisits} page visits + ${Object.keys(MIN_NAV_ITEMS).length} nav-shape checks`);
