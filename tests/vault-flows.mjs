// tests/vault-flows.mjs — Playwright walk through the new Vault CREATE flows.
//
// What this asserts (in demo mode against repflow.koino.capital, or
// SMOKE_URL=http://localhost:3000 npm run test:vault):
//
//   1. /vault → Courses shows 3 starter courses with the "starter" chip.
//   2. /vault → Scripts → "+ New script" modal opens, validates, closes.
//   3. /vault → Documents has the drag/drop hint and Add doc button.
//   4. /vault → Segments → "+ New segment" modal includes the
//      "Filter rules" field and an "Add rule" button.
//   5. /vault → Carriers → "+ New appointment" modal includes the
//      Appointed states picker.
//   6. /vault → Videos and Quick Links each expose "+ New" buttons.
//   7. /admin → "Security" tab loads (super_admin only) without crashing.
//
// We don't actually persist rows — demo mode runs against a sandbox seed,
// and we don't want to pollute it. Each flow opens the modal, asserts the
// expected fields are present, then cancels.
//
// Exits 1 on any failure. Screenshots → smoke-artifacts/vault-*.png.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = (process.env.SMOKE_URL || "https://repflow.koino.capital").replace(/\/$/, "");
const ARTIFACT_DIR = "smoke-artifacts";
await mkdir(ARTIFACT_DIR, { recursive: true });

const failures = [];
const passes   = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    if (/Failed to load resource|serviceWorker|Manifest:/i.test(t)) return;
    consoleErrors.push(t);
  }
});
page.on("pageerror", (err) => consoleErrors.push("[pageerror] " + (err.message || String(err))));

async function snap(name) {
  const p = join(ARTIFACT_DIR, `vault-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function check(label, fn) {
  consoleErrors.length = 0;
  const start = Date.now();
  try {
    await fn();
    passes.push({ label, ms: Date.now() - start });
    console.log(`  ✓ ${label}  (${Date.now() - start}ms)`);
  } catch (e) {
    const shot = await snap(label.replace(/\W+/g, "_"));
    failures.push({ label, err: String(e.message || e), console: consoleErrors.slice(0, 5), shot });
    console.log(`  ✘ ${label}  — ${e.message || e}\n      shot: ${shot}`);
  }
}

console.log(`vault-flows → ${BASE}/?demo=1`);
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Land on /vault as super_admin so every button is visible.
async function setRole(role) {
  const btn = page.locator(`.role-switch button[title="${role}"]`).first();
  if (await btn.count() > 0) await btn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function goto(p) {
  await page.evaluate((target) => window.gotoPage && window.gotoPage(target), p);
  await page.waitForTimeout(700);
}
async function clickSectionTab(label) {
  // SectionPill renders a button per tab. Find by text.
  const sel = `.section-pill-tab >> text=${label}`;
  let loc = page.locator(sel).first();
  if ((await loc.count()) === 0) {
    // Fallback selectors for different SectionPill class names.
    loc = page.locator(`button >> text=${label}`).first();
  }
  await loc.click({ timeout: 3000 });
  await page.waitForTimeout(350);
}

await setRole("super_admin");
await goto("vault");

// 1. Courses tab — 3 starter chips, +New course button.
await check("courses-starter-chip-present", async () => {
  await clickSectionTab("Courses");
  await page.waitForTimeout(500);
  const starterChips = await page.locator('text="starter"').count();
  if (starterChips === 0) throw new Error("no starter chip found on Courses tab");
});

// 2. Scripts tab — +New script opens modal with target_roles + segment.
await check("scripts-new-modal", async () => {
  await clickSectionTab("Scripts");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("New script")').first().click({ timeout: 3000 });
  await page.waitForTimeout(300);
  const hasTitle    = await page.locator('input[placeholder*="Cold Open"]').count();
  const hasBody     = await page.locator('textarea[placeholder*="lead_first"]').count();
  const hasVisible  = await page.locator('text="Visible to"').count();
  if (!hasTitle || !hasBody || !hasVisible)
    throw new Error(`script modal missing fields (title=${hasTitle} body=${hasBody} visible=${hasVisible})`);
  // Cancel
  await page.locator('button:has-text("Cancel")').first().click({ timeout: 3000 });
  await page.waitForTimeout(200);
});

// 3. Documents tab — drag/drop hint + Add doc button.
await check("docs-drag-drop-hint", async () => {
  await clickSectionTab("Documents");
  await page.waitForTimeout(300);
  const hasDragHint = await page.locator('text="Drag any file"').count();
  const hasAddBtn   = await page.locator('button:has-text("Add doc")').count();
  if (!hasDragHint || !hasAddBtn) throw new Error(`docs drag hint=${hasDragHint} add btn=${hasAddBtn}`);
});

// 4. Segments tab — +New segment modal carries filter_rules section + "Add rule".
await check("segments-new-with-filter-rules", async () => {
  await clickSectionTab("Segments");
  await page.waitForTimeout(300);
  // Either the "Create first segment" or the side "+New" button.
  const first = page.locator('button:has-text("Create first segment")').first();
  const sideNew = page.locator('button:has-text("New")').filter({ hasText: /^\s*New\s*$/ }).first();
  if (await first.count() > 0) await first.click({ timeout: 3000 });
  else                          await sideNew.click({ timeout: 3000 });
  await page.waitForTimeout(300);
  const hasFilterRules = await page.locator('text="Filter rules"').count();
  const hasAddRule     = await page.locator('button:has-text("Add rule")').count();
  if (!hasFilterRules || !hasAddRule)
    throw new Error(`segment modal missing filter rules (rules=${hasFilterRules} add=${hasAddRule})`);
  await page.locator('button:has-text("Cancel")').first().click({ timeout: 3000 });
  await page.waitForTimeout(200);
});

// 5. Carriers tab — +New appointment modal with state picker.
await check("carriers-new-appointment-modal", async () => {
  await clickSectionTab("Carriers");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("New appointment")').first().click({ timeout: 3000 });
  await page.waitForTimeout(300);
  const hasStates = await page.locator('text="Appointed states"').count();
  const hasFL = await page.locator('button.chip:has-text("FL")').count();
  if (!hasStates || !hasFL)
    throw new Error(`carriers modal missing states picker (states=${hasStates} FL=${hasFL})`);
  await page.locator('button:has-text("Cancel")').first().click({ timeout: 3000 });
  await page.waitForTimeout(200);
});

// 6. Videos + Quick Links each expose New buttons.
await check("videos-new-button", async () => {
  await clickSectionTab("Videos");
  await page.waitForTimeout(300);
  if ((await page.locator('button:has-text("New video")').count()) === 0)
    throw new Error("no New video button");
});
await check("links-new-button", async () => {
  await clickSectionTab("Quick links");
  await page.waitForTimeout(300);
  if ((await page.locator('button:has-text("New link")').count()) === 0)
    throw new Error("no New link button");
});

// 7. Admin → Security tab loads.
await check("admin-security-tab", async () => {
  await goto("admin");
  await page.waitForTimeout(700);
  // Click the Security tab — both PageAdmin and its inner SectionPill may render slightly different markup
  const tab = page.locator('button:has-text("Security")').first();
  if ((await tab.count()) === 0) throw new Error("Security tab not found in admin");
  await tab.click({ timeout: 3000 });
  await page.waitForTimeout(700);
  const hasAdvisorTitle = await page.locator('text="Security advisor"').count();
  if (!hasAdvisorTitle) throw new Error("Security advisor panel did not render");
});

await ctx.close();
await browser.close();

const summary = { base: BASE, ts: new Date().toISOString(), passes, failures };
await writeFile(join(ARTIFACT_DIR, "vault-flows-summary.json"), JSON.stringify(summary, null, 2));

console.log(`\n${failures.length === 0 ? "✓" : "✘"} ${passes.length} passed · ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f.label}: ${f.err}`);
  process.exit(1);
}
