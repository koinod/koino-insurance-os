// tests/smoke.mjs — minimal Playwright smoke. Loads ?demo=1 (which skips
// auth and seeds the Atlas sandbox), iterates roles + every sidebar nav
// page, asserts no React error boundary triggered and no `console.error`
// surfaced from the page.
//
// Usage:
//   npx playwright install chromium     # one-time
//   npm run smoke                       # against repflow.koino.capital
//   SMOKE_URL=http://localhost:3000 npm run smoke
//
// Exits 1 if any page surfaced a crash. Screenshots of failures land in
// smoke-artifacts/.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = (process.env.SMOKE_URL || "https://repflow.koino.capital").replace(/\/$/, "");
const ARTIFACT_DIR = "smoke-artifacts";
await mkdir(ARTIFACT_DIR, { recursive: true });

// Pages visible per role. Pull from shared.jsx NAV.* — keep in sync if NAV changes.
const PAGES_BY_ROLE = {
  rep:         ["today", "floor", "messages", "leaderboard", "library", "connections"],
  manager:     ["today", "book", "crm", "leaddrip", "quote", "vault", "floor", "connections"],
  super_admin: ["today", "book", "crm", "leaddrip", "quote", "vault", "floor", "connections", "admin"],
};

const failures = [];

async function trip(role, page) {
  return `${role}/${page}`;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text();
    // Filter benign warnings (sw register failures from localhost, etc.).
    if (/Failed to load resource/i.test(text)) return;
    if (/serviceWorker/i.test(text)) return;
    consoleErrors.push(text);
  }
});
page.on("pageerror", (err) => consoleErrors.push("[pageerror] " + (err.message || String(err))));

console.log(`smoke → ${BASE}?demo=1`);
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
// Give the demo seed + hydrate a moment to finish.
await page.waitForTimeout(2000);

for (const [role, navPages] of Object.entries(PAGES_BY_ROLE)) {
  // Demo agency exposes a role-switch button row in the sidebar. Click the
  // matching button to flip role. Fall back to evaluate-set on the tweak
  // store if the button selector misses.
  const roleLabel = role === "rep" ? "Rep" : role === "manager" ? "Mgr" : "Admin";
  const btn = page.locator(`.role-switch button[title="${role}"]`).first();
  if (await btn.count() > 0) {
    await btn.click({ timeout: 3000 }).catch(() => {});
  } else {
    // Fallback for when the role-switch isn't in the DOM (non-demo seed).
    await page.evaluate(
      (r) => { try { localStorage.setItem("repflow.role", r); } catch {} },
      role
    );
  }
  await page.waitForTimeout(400);

  for (const p of navPages) {
    consoleErrors.length = 0;
    const start = Date.now();
    try {
      await page.evaluate((target) => window.gotoPage && window.gotoPage(target), p);
      await page.waitForTimeout(700);
      // Look for either the error-boundary panel ("This panel hit an error.")
      // or a React minified-error string.
      const errPanel = await page.locator('text="This panel hit an error."').count();
      const consoleHit = consoleErrors.find((e) => /Minified React error|TypeError|ReferenceError/i.test(e));
      if (errPanel > 0 || consoleHit) {
        const name = `${role}_${p}_${Date.now()}.png`;
        await page.screenshot({ path: join(ARTIFACT_DIR, name), fullPage: false });
        failures.push({
          where: await trip(role, p),
          errPanel,
          console: consoleErrors.slice(0, 5),
          screenshot: name,
          ms: Date.now() - start,
        });
        console.log(`  ✘ ${role}/${p}  (${errPanel} boundary, ${consoleErrors.length} console errs) → ${name}`);
      } else {
        console.log(`  ✓ ${role}/${p}  (${Date.now() - start}ms)`);
      }
    } catch (e) {
      failures.push({ where: await trip(role, p), thrown: String(e) });
      console.log(`  ✘ ${role}/${p}  thrown: ${e.message || e}`);
    }
  }
}

await ctx.close();
await browser.close();

const summaryPath = join(ARTIFACT_DIR, "summary.json");
await writeFile(summaryPath, JSON.stringify({ base: BASE, ts: new Date().toISOString(), failures }, null, 2));

if (failures.length > 0) {
  console.log(`\n✘ ${failures.length} page(s) crashed. See ${summaryPath} + ${ARTIFACT_DIR}/*.png`);
  process.exit(1);
}
console.log(`\n✓ all clean across ${Object.values(PAGES_BY_ROLE).flat().length} page visits`);
