// tests/vault-flows.mjs — Playwright walk through the new Vault CREATE flows.
//
// What this asserts (in demo mode against repflow.koino.capital, or
// SMOKE_URL=http://localhost:3000 npm run test:vault):
//
//   1. /vault → Courses shows the "+ New course" / "+ Assign course" buttons.
//   2. /vault → Scripts → "+ New script" modal opens with title/body/visible-to.
//   3. /vault → Documents has the drag/drop hint and Add doc button.
//   4. /vault → Segments → "+ New segment" modal includes a Filter rules row.
//   5. /vault → Carriers → "+ New appointment" modal includes a states picker.
//   6. /vault → Videos and Quick links each expose "+ New" buttons.
//   7. /admin → "Security" tab loads (super_admin only) without crashing.
//
// We don't actually persist rows — demo mode runs against the Atlas seed and
// we don't want to pollute it. Each flow opens the modal, asserts the
// expected fields are present, then closes via Escape.
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
    failures.push({ label, err: String(e.message || e), console: consoleErrors.slice(0, 3), shot });
    console.log(`  ✘ ${label}  — ${e.message || e}\n      shot: ${shot}`);
  }
}

// Ensure no modal is open before clicking nav elements (sticky cmdk-overlay).
async function closeAnyModal() {
  // Hit Escape twice to clear any modal + cmdk overlay
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
}

async function setRole(role) {
  const btn = page.locator(`.role-switch button[title="${role}"]`).first();
  if (await btn.count() > 0) await btn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function goto(p) {
  await closeAnyModal();
  await page.evaluate((target) => window.gotoPage && window.gotoPage(target), p);
  await page.waitForTimeout(700);
}
async function clickSectionTab(label) {
  await closeAnyModal();
  // SectionPill renders inside the page-h area. Match the tab button by text.
  // Use a substring text matcher so "Quick links" (label) matches "Quick links" button.
  const sel = page.locator(`.section-pill button, .section-pill-tab`).filter({ hasText: new RegExp(`^\\s*${label}`, "i") }).first();
  if ((await sel.count()) === 0) {
    // Fallback: any button with that text inside the page-pad.
    const fb = page.locator(`button`).filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, "i") }).first();
    await fb.click({ timeout: 3000 });
  } else {
    await sel.click({ timeout: 3000 });
  }
  await page.waitForTimeout(350);
}

console.log(`vault-flows → ${BASE}/?demo=1`);
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

await setRole("super_admin");
await goto("vault");

// 1. Courses tab — every "can edit" role (owner / super_admin / manager) sees
//    "New course". Manager additionally sees "Assign course". We're running as
//    super_admin, so only New course is required here; the assign-course flow
//    is exercised by switching to the Mgr role in a separate hop below.
await check("courses-new-course-button-super_admin", async () => {
  await clickSectionTab("Courses");
  await page.waitForTimeout(400);
  const newBtn = await page.getByRole("button", { name: /New course/i }).count();
  if (newBtn === 0) throw new Error(`courses missing New course button (count=${newBtn})`);
});
await check("courses-assign-course-as-manager", async () => {
  await setRole("manager");
  await goto("vault");
  await clickSectionTab("Courses");
  await page.waitForTimeout(500);
  const newBtn    = await page.getByRole("button", { name: /New course/i }).count();
  const assignBtn = await page.getByRole("button", { name: /Assign course/i }).count();
  if (newBtn === 0 || assignBtn === 0)
    throw new Error(`manager courses tab missing buttons (new=${newBtn} assign=${assignBtn})`);
  // Open Assign course modal and confirm the downline-scoped picker shows up.
  await page.getByRole("button", { name: /Assign course/i }).first().click({ timeout: 3000 });
  await page.waitForTimeout(400);
  const hasDownlineLabel = await page.getByText(/Producers in your downline/i).count();
  if (!hasDownlineLabel) throw new Error("Assign-course modal missing 'Producers in your downline' label");
  await closeAnyModal();
  await setRole("super_admin");
  await goto("vault");
});

// 2. Scripts tab — +New script opens modal with title/body/visible-to.
await check("scripts-new-modal", async () => {
  await clickSectionTab("Scripts");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /New script/i }).first().click({ timeout: 3000 });
  await page.waitForTimeout(300);
  const hasTitle    = await page.locator('input[placeholder*="Cold Open"]').count();
  const hasBody     = await page.locator('textarea[placeholder*="lead_first"]').count();
  const hasVisible  = await page.getByText(/Visible to/i).count();
  if (!hasTitle || !hasBody || !hasVisible)
    throw new Error(`script modal missing fields (title=${hasTitle} body=${hasBody} visible=${hasVisible})`);
  await closeAnyModal();
});

// 3. Documents tab — drag/drop hint + Add doc button.
await check("docs-drag-drop-hint", async () => {
  await clickSectionTab("Documents");
  await page.waitForTimeout(300);
  const hasDragHint = await page.getByText(/Drag any file/i).count();
  const hasAddBtn   = await page.getByRole("button", { name: /Add doc/i }).count();
  if (!hasDragHint || !hasAddBtn) throw new Error(`docs drag hint=${hasDragHint} add btn=${hasAddBtn}`);
});

// 4. Segments tab — +New segment modal carries Filter rules + "Add rule".
await check("segments-new-with-filter-rules", async () => {
  await clickSectionTab("Segments");
  await page.waitForTimeout(300);
  // Try the empty-state "Create first segment" then the side "+New" button.
  const first  = page.getByRole("button", { name: /Create first segment/i }).first();
  const sideNew = page.getByRole("button", { name: /^\s*New\s*$/ }).first();
  if (await first.count() > 0) await first.click({ timeout: 3000 });
  else                          await sideNew.click({ timeout: 3000 });
  await page.waitForTimeout(400);
  const hasFilterRules = await page.getByText(/Filter rules/i).count();
  const hasAddRule     = await page.getByRole("button", { name: /Add rule/i }).count();
  if (!hasFilterRules || !hasAddRule)
    throw new Error(`segment modal missing filter rules (rules=${hasFilterRules} add=${hasAddRule})`);
  await closeAnyModal();
});

// 5. Carriers tab — +New appointment modal with state picker.
await check("carriers-new-appointment-modal", async () => {
  await clickSectionTab("Carriers");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /New appointment/i }).first().click({ timeout: 3000 });
  await page.waitForTimeout(400);
  const hasStates = await page.getByText(/Appointed states/i).count();
  const hasFL     = await page.locator('button.chip:has-text("FL")').count();
  if (!hasStates || !hasFL)
    throw new Error(`carriers modal missing states picker (states=${hasStates} FL=${hasFL})`);
  await closeAnyModal();
});

// 6. Videos + Quick links each expose New buttons.
await check("videos-new-button", async () => {
  await clickSectionTab("Videos");
  await page.waitForTimeout(300);
  if ((await page.getByRole("button", { name: /New video/i }).count()) === 0)
    throw new Error("no New video button");
});
await check("links-new-button", async () => {
  await clickSectionTab("Quick links");
  await page.waitForTimeout(300);
  if ((await page.getByRole("button", { name: /New link/i }).count()) === 0)
    throw new Error("no New link button");
});

// 7. Admin → Security tab loads.
await check("admin-security-tab", async () => {
  await goto("admin");
  await page.waitForTimeout(800);
  const tab = page.getByRole("button", { name: /^\s*Security\s*$/i }).first();
  if ((await tab.count()) === 0) throw new Error("Security tab not found in admin");
  await tab.click({ timeout: 3000 });
  await page.waitForTimeout(800);
  const hasAdvisorTitle = await page.getByText(/Security advisor/i).count();
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
