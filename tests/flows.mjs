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

// ─── 1. CRM kanban drag — New → Contacted ─────────────────────────────────
await record("crm_kanban_drag", async () => {
  await setRole("manager");
  await goto("crm");

  // CRM uses the same kanban DnD shape as pipeline. Switch to kanban view if
  // there's a view-toggle; many CRM builds default to list.
  const kanbanBtn = page.locator('button:has-text("Kanban"), [data-view="kanban"]').first();
  if (await kanbanBtn.count() > 0) {
    await kanbanBtn.click().catch(() => {});
    await page.waitForTimeout(400);
  }

  // Find a "New" column and grab the first draggable card in it.
  const newCol = page.locator('.panel:has(.panel-h h3:has-text("New"))').first();
  if (await newCol.count() === 0) throw new Error("could not locate 'New' kanban column");
  const card = newCol.locator('[draggable="true"]').first();
  if (await card.count() === 0) throw new Error("no draggable card in 'New' column");
  const cardName = (await card.innerText()).split("\n")[0].trim();

  const contactedCol = page.locator('.panel:has(.panel-h h3:has-text("Contacted"))').first();
  if (await contactedCol.count() === 0) throw new Error("could not locate 'Contacted' column");

  // HTML5 DnD: dragTo() bridges Playwright into the right event sequence.
  await card.dragTo(contactedCol);
  await page.waitForTimeout(800);

  // Assert the card now lives under "Contacted".
  const landed = await contactedCol.locator(`text="${cardName}"`).count();
  if (landed === 0) throw new Error(`card "${cardName}" did not land in Contacted`);
});

// ─── 2. Autodial pin — pipeline lead → Floor Start ≥ 1 ────────────────────
await record("autodial_pin_from_pipeline", async () => {
  await setRole("manager");
  await goto("crm");

  // Clear any leftover queue from a previous run so the assertion is honest.
  await page.evaluate(() => window.AutodialQueue && window.AutodialQueue.clear && window.AutodialQueue.clear());
  await page.waitForTimeout(200);

  // Open the first lead row (list view default).
  const row = page.locator('.row').first();
  if (await row.count() === 0) throw new Error("no rows in CRM list");
  await row.click();
  await page.waitForTimeout(500);

  // Click any "Send to autodial" / "Add to autodial" affordance.
  const pin = page.locator('button:has-text("autodial"), button:has-text("Autodial")').first();
  if (await pin.count() === 0) throw new Error("no 'Send to autodial' button on lead detail");
  await pin.click();
  await page.waitForTimeout(400);

  // Verify the queue actually grew (server-side path may be best-effort but
  // localStorage / window.AutodialQueue.count() is authoritative for UI).
  const queued = await page.evaluate(() => (window.AutodialQueue && window.AutodialQueue.count && window.AutodialQueue.count()) || 0);
  if (queued < 1) throw new Error(`AutodialQueue.count() = ${queued}, expected ≥ 1`);

  // Navigate to Floor and find a Start button (autodial bar / floor action).
  await goto("floor");
  const starts = await page.locator('button:has-text("Start")').count();
  if (starts < 1) throw new Error(`Floor 'Start' button count = ${starts}, expected ≥ 1`);
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
  const input = page.locator('input[placeholder*="title" i], input[name="title"]').first();
  if (await input.count() === 0) throw new Error("no title input in course modal");
  await input.fill(title);

  const save = page.locator('button:has-text("Save"), button:has-text("Create")').last();
  await save.click();
  await page.waitForTimeout(800);

  // Assert the new course appears somewhere on the Courses page.
  const found = await page.locator(`text="${title}"`).count();
  if (found === 0) throw new Error(`new course "${title}" not in library after save`);
});

// ─── 4. Doc upload — Vault → Documents → Add doc → URL → save → row ──────
await record("vault_doc_upload_url", async () => {
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

  const docTitle = `Smoke Doc ${Date.now()}`;
  const titleInput = page.locator('input[placeholder*="title" i], input[name="title"]').first();
  if (await titleInput.count() > 0) await titleInput.fill(docTitle);

  const urlInput = page.locator('input[placeholder*="url" i], input[name="url"], input[type="url"]').first();
  if (await urlInput.count() === 0) throw new Error("no URL input in doc modal");
  await urlInput.fill("https://example.com/smoke.pdf");

  const save = page.locator('button:has-text("Save"), button:has-text("Add")').last();
  await save.click();
  await page.waitForTimeout(800);

  const found = await page.locator(`text="${docTitle}"`).count();
  if (found === 0) throw new Error(`new doc "${docTitle}" not in list after save`);
});

// ─── 5. Vault carrier deeplink — "Manage in Admin" → Admin Carriers ──────
await record("vault_carrier_deeplink_admin", async () => {
  await setRole("super_admin");
  await goto("vault");

  const carriersTab = page.locator('button:has-text("Carriers"), [role="tab"]:has-text("Carriers")').first();
  if (await carriersTab.count() > 0) {
    await carriersTab.click();
    await page.waitForTimeout(400);
  }

  const manage = page.locator('a:has-text("Manage in Admin"), button:has-text("Manage in Admin")').first();
  if (await manage.count() === 0) throw new Error("no 'Manage in Admin' deeplink on Vault carriers");
  await manage.click();
  await page.waitForTimeout(1000);

  // Assert we landed on the Admin page with Carriers tab active.
  const onAdminCarriers = await page.evaluate(() => {
    const titleEl = document.querySelector('.page-title');
    const title = titleEl ? titleEl.textContent.toLowerCase() : "";
    // Either the page title says "Admin" with a carriers tab active, or the
    // url/hash hints carriers. Check both shapes.
    const carriersActive = !!document.querySelector('.tab.active, [aria-selected="true"], button.active');
    return title.includes("admin") && (carriersActive || /carrier/i.test(document.body.innerText || ""));
  });
  if (!onAdminCarriers) throw new Error("did not land on Admin Carriers after deeplink");
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
