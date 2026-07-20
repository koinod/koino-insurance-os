// tests/flows.mjs — Playwright smoke flows. Five end-to-end scenarios that
// touch the highest-value mutation paths in repflow. Each scenario:
//   1. resets to ?demo=1 (Atlas sandbox seeded, no auth)
//   2. flips to the role the flow needs (matches smoke.mjs pattern)
//   3. runs the user action via window.gotoPage + DOM clicks
//   4. asserts a concrete post-condition (DOM text, queue count, etc.)
//
// Exits 1 on any failure. Screenshots of failures land in flow-artifacts/.
//
// Usage:
//   npx playwright install chromium     # one-time
//   npm run flows                       # against repflow.koino.capital
//   SMOKE_URL=http://localhost:3000 npm run flows

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = (process.env.SMOKE_URL || "https://repflow.koino.capital").replace(/\/$/, "");
const ARTIFACT_DIR = "flow-artifacts";
await mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text();
    if (/Failed to load resource/i.test(text)) return;
    if (/serviceWorker/i.test(text)) return;
    consoleErrors.push(text);
  }
});
page.on("pageerror", (err) => consoleErrors.push("[pageerror] " + (err.message || String(err))));

const failures = [];

async function bootDemo() {
  consoleErrors.length = 0;
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

// Match smoke.mjs role-switch pattern: prefer the demo's role-switch
// buttons; fall back to a localStorage write if they're not present.
async function setRole(role) {
  const btn = page.locator(`.role-switch button[title="${role}"]`).first();
  if (await btn.count() > 0) {
    await btn.click({ timeout: 3000 }).catch(() => {});
  } else {
    await page.evaluate((r) => { try { localStorage.setItem("repflow.role", r); } catch {} }, role);
  }
  await page.waitForTimeout(400);
}

async function goto(p) {
  await page.evaluate((target) => window.gotoPage && window.gotoPage(target), p);
  await page.waitForTimeout(800);
}

async function record(name, fn) {
  const start = Date.now();
  consoleErrors.length = 0;
  try {
    await bootDemo();
    await fn();
    console.log(`  ✓ ${name}  (${Date.now() - start}ms)`);
  } catch (e) {
    const screenshot = `${name.replace(/\W+/g, "_")}_${Date.now()}.png`;
    try { await page.screenshot({ path: join(ARTIFACT_DIR, screenshot), fullPage: false }); } catch {}
    failures.push({ name, error: String(e.message || e), console: consoleErrors.slice(0, 5), screenshot });
    console.log(`  ✘ ${name}  → ${e.message || e}`);
  }
}

console.log(`flows → ${BASE}?demo=1\n`);

// ─── 1. CRM workspace — views and add menu ────────────────────────────────
await record("crm_workspace_views", async () => {
  await setRole("manager");
  await goto("crm");
  for (const label of ["Pipeline", "Clients", "Money", "Carriers"]) {
    const tab = page.locator(`button:has-text("${label}")`).first();
    if (await tab.count() === 0) throw new Error(`missing CRM view: ${label}`);
    await tab.click();
    await page.waitForTimeout(150);
  }
  const add = page.locator('button:has-text("+ Add")').first();
  if (await add.count() === 0) throw new Error("missing CRM add menu");
  await add.click();
  for (const label of ["Lead", "Deal", "Deposit", "Expense"]) {
    if (await page.locator(`.crm-add-menu button:has-text("${label}")`).count() === 0) throw new Error(`missing add action: ${label}`);
  }
});

// ─── 2. CRM record drawer — pipeline row → detail actions ─────────────────
await record("crm_record_drawer", async () => {
  await setRole("manager");
  await goto("crm");
  await page.locator('.crm-views button:has-text("Pipeline")').click();
  await page.waitForTimeout(200);
  const row = page.locator('.crm-table tbody tr').first();
  if (await row.count() === 0) throw new Error("no rows in CRM pipeline");
  await row.click();
  await page.waitForTimeout(500);
  if (await page.locator('.crm-drawer').count() === 0) throw new Error("CRM record drawer did not open");
  if (await page.locator('.crm-drawer button:has-text("Write deal")').count() === 0) throw new Error("record drawer missing Write deal action");
});

// ─── 3. Course create — Vault → Courses → New → save → in library ────────
await record("vault_course_create", async () => {
  await setRole("manager");
  await goto("vault");

  // Tab into Courses.
  const coursesTab = page.locator('button:has-text("Courses"), [role="tab"]:has-text("Courses")').first();
  if (await coursesTab.count() > 0) {
    await coursesTab.click();
    await page.waitForTimeout(400);
  }

  const newBtn = page.locator('button:has-text("New course"), button:has-text("New Course"), button:has-text("New")').first();
  if (await newBtn.count() === 0) throw new Error("no 'New course' button visible");
  await newBtn.click();
  await page.waitForTimeout(400);

  const title = `Smoke Course ${Date.now()}`;
  const input = page.locator('.modal input').first();
  if (await input.count() === 0) throw new Error("no title input in course modal");
  await input.fill(title);

  const save = page.locator('button:has-text("Save"), button:has-text("Create")').last();
  await save.click();
  await page.waitForTimeout(800);

  // Assert the new course appears somewhere on the Courses page.
  const found = await page.locator(`text="${title}"`).count();
  if (found === 0) throw new Error(`new course "${title}" not in library after save`);
});

// ─── 4. Doc import surface — Vault → Documents → Add doc → URL field ─────
await record("vault_doc_import_surface", async () => {
  await setRole("manager");
  await goto("vault");

  const docsTab = page.locator('button:has-text("Documents"), button:has-text("Docs")').first();
  if (await docsTab.count() > 0) {
    await docsTab.click();
    await page.waitForTimeout(400);
  }

  const add = page.locator('button:has-text("Add doc"), button:has-text("Add document"), button:has-text("New doc"), button:has-text("Upload")').first();
  if (await add.count() === 0) throw new Error("no 'Add doc' button visible");
  await add.click();
  await page.waitForTimeout(400);

  const urlInput = page.locator('.modal input').nth(1);
  if (await urlInput.count() === 0) throw new Error("no URL input in doc modal");
  await urlInput.fill("https://example.com/smoke.pdf");
  if (await page.locator('.modal button:has-text("Add")').count() === 0) throw new Error("document modal missing Add action");
});

// ─── 5. Vault carrier directory — carriers tab renders current directory ───
await record("vault_carrier_directory", async () => {
  await setRole("super_admin");
  await goto("vault");

  const carriersTab = page.locator('button:has-text("Carriers"), [role="tab"]:has-text("Carriers")').first();
  if (await carriersTab.count() > 0) {
    await carriersTab.click();
    await page.waitForTimeout(400);
  }

  if (await page.locator('text="Carriers directory"').count() === 0) throw new Error("carrier directory did not render");
  if (await page.locator('button:has-text("New appointment")').count() === 0) throw new Error("carrier page missing manager appointment action");
});

await ctx.close();
await browser.close();

const summaryPath = join(ARTIFACT_DIR, "summary.json");
await writeFile(summaryPath, JSON.stringify({ base: BASE, ts: new Date().toISOString(), failures }, null, 2));

if (failures.length > 0) {
  console.log(`\n✘ ${failures.length} flow(s) failed. See ${summaryPath} + ${ARTIFACT_DIR}/*.png`);
  process.exit(1);
}
console.log(`\n✓ all 5 flows passed`);
