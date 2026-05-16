// tests/interactions.mjs — interactive smoke test. Sibling to tests/smoke.mjs.
// Where smoke.mjs only navigates and watches for boundaries, this one actually
// CLICKS things — enroll modals, dropdowns, dial calcs — and asserts on what
// the UI does after the click. Catches click-only regressions (e.g. EnrollModal
// `next_step_at` column miss) that pure navigation can't see.
//
// Usage:
//   npx playwright install chromium      # one-time
//   npm run smoke:interactions           # against repflow.koino.capital
//   SMOKE_URL=http://localhost:3000 npm run smoke:interactions
//
// Each test is a named async function returning { pass: boolean, evidence: string }.
// Tests run in order; we don't short-circuit on individual failures (the suite
// reports per-test status) but we DO fail-fast at the navigation step before
// each test, so one busted page doesn't cascade fake passes into the next.
//
// Exits 1 if any test failed. Per-test screenshots on failure → smoke-artifacts/.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = (process.env.SMOKE_URL || "https://repflow.koino.capital").replace(/\/$/, "");
const ARTIFACT_DIR = "smoke-artifacts";
await mkdir(ARTIFACT_DIR, { recursive: true });

// ─── Console-error sink, shared across tests but cleared between them ──────
const consoleErrors = [];
function isBenignConsoleError(text) {
  if (/Failed to load resource/i.test(text)) return true;
  if (/serviceWorker/i.test(text)) return true;
  if (/sw\.js/i.test(text)) return true;
  // Hashed Supabase 4xx from demo mode (no real session) — benign.
  if (/supabase\.co\/.+ 40[0-9]/i.test(text)) return true;
  if (/Manifest:/i.test(text)) return true;
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
async function switchRole(page, role) {
  // The demo agency exposes a role-switch button row. super_admin sees the
  // most tabs; manager sees Lead Drip + CRM + Floor; rep doesn't see CRM.
  const btn = page.locator(`.role-switch button[title="${role}"]`).first();
  if (await btn.count() > 0) {
    await btn.click({ timeout: 3000 }).catch(() => {});
  } else {
    await page.evaluate(
      (r) => { try { localStorage.setItem("repflow.role", r); } catch {} },
      role
    );
  }
  await page.waitForTimeout(400);
}

async function gotoPage(page, target) {
  await page.evaluate((t) => window.gotoPage && window.gotoPage(t), target);
  await page.waitForTimeout(700);
}

function boundaryHit() {
  return consoleErrors.find((e) => /Minified React error|TypeError|ReferenceError|Uncaught/i.test(e));
}

async function errorPanelCount(page) {
  return await page.locator('text="This panel hit an error."').count();
}

async function snapEvidence(testName, idx, page) {
  const ts = Date.now();
  const file = `interactions_${idx}_${testName}_${ts}.png`;
  try {
    await page.screenshot({ path: join(ARTIFACT_DIR, file), fullPage: false });
  } catch {}
  return file;
}

// ─── Test 1: testEnrollLead ───────────────────────────────────────────────
async function testEnrollLead(page) {
  await gotoPage(page, "leaddrip");
  // Click the Sequences inner tab. The tab buttons live in the row right
  // below page-h. Text-match keeps us robust to className changes.
  const seqTab = page.locator("button", { hasText: /^Sequences$/ }).first();
  if (await seqTab.count() === 0) {
    return { pass: false, evidence: "Sequences inner tab not found in DOM" };
  }
  await seqTab.click({ timeout: 3000 });
  await page.waitForTimeout(500);

  // Two "Enroll lead" buttons exist on the page (top page-h + the per-seq
  // SeqDetail). Click the page-h one — first in DOM order.
  const enrollBtn = page.locator("button", { hasText: /^\s*Enroll lead\s*$/ }).first();
  if (await enrollBtn.count() === 0) {
    return { pass: false, evidence: "No 'Enroll lead' button on Sequences tab" };
  }
  await enrollBtn.click({ timeout: 3000 });
  await page.waitForTimeout(500);

  // Modal title is the canonical anchor.
  const modalTitle = page.locator('text="Enroll lead in sequence"');
  if (await modalTitle.count() === 0) {
    return { pass: false, evidence: "EnrollModal did not open after click" };
  }

  // Pick first lead + first sequence. The modal contains two <Shared.Select>
  // (Lead, Sequence) — both render as <select> children of the modal panel.
  const selects = page.locator('.modal select, [role="dialog"] select');
  const selCount = await selects.count();
  if (selCount < 2) {
    return { pass: false, evidence: `expected 2 selects in EnrollModal, got ${selCount}` };
  }

  // Lead select: pick first non-empty option (option index 1 — index 0 is
  // the "— pick a lead —" placeholder).
  const leadValues = await selects.nth(0).locator("option").evaluateAll((opts) =>
    opts.map((o) => o.value)
  );
  const leadPick = leadValues.find((v) => v && v.length > 0);
  if (!leadPick) {
    return { pass: false, evidence: "EnrollModal lead select had no real leads (demo agency PIPELINE empty?)" };
  }
  await selects.nth(0).selectOption(leadPick);

  // Sequence: any value present (defaults to first sequence). Skip if no opts.
  const seqValues = await selects.nth(1).locator("option").evaluateAll((opts) =>
    opts.map((o) => o.value)
  );
  if (seqValues.length === 0) {
    return { pass: false, evidence: "EnrollModal sequence select had zero options" };
  }
  // Already defaulted, but explicitly pick to be safe.
  await selects.nth(1).selectOption(seqValues[0]);

  // Now click the green Enroll button at the bottom of the modal. Match the
  // btn-primary inside the modal action row; the label is "Enroll" or
  // "Enrolling…" while pending.
  const submit = page.locator('.modal .btn-primary, [role="dialog"] .btn-primary').filter({ hasText: /^\s*Enroll\s*$/ }).first();
  if (await submit.count() === 0) {
    return { pass: false, evidence: "No green Enroll submit button in modal" };
  }

  // Reset console-error sink right before the click so we attribute any
  // boundary specifically to the enrollment flow.
  consoleErrors.length = 0;
  await submit.click({ timeout: 3000 });
  await page.waitForTimeout(1500); // give the insert/toast a beat

  if (boundaryHit()) {
    return { pass: false, evidence: `React boundary fired on enroll: ${consoleErrors.slice(0,3).join(" · ")}` };
  }
  if (await errorPanelCount(page) > 0) {
    return { pass: false, evidence: "Error boundary panel appeared after enroll click" };
  }

  // Toast is best-effort. We log presence but don't fail on absence (demo
  // agency may not be wired to Supabase) — the PASS contract is "no crash".
  const toastSeen = await page.locator('.toast, [data-toast], [role="status"]').count() > 0;
  return { pass: true, evidence: `enroll clicked, toast=${toastSeen}, no boundary` };
}

// ─── Test 2: testEditCrmSource ────────────────────────────────────────────
async function testEditCrmSource(page) {
  await gotoPage(page, "crm");
  // Inbox is the default inner tab — but force it via section pill in case
  // a prior test left a different tab cached.
  const inbox = page.locator("button", { hasText: /^Inbox$/ }).first();
  if (await inbox.count() > 0) {
    await inbox.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }

  // The first row's source select is the 2nd select in that row (Source
  // column). Filter selects to the rows (skip the top filter strip's 3
  // selects: stage filter, source filter, owner filter). Use grid row class.
  const rows = page.locator(".row");
  const rowCount = await rows.count();
  if (rowCount === 0) {
    return { pass: false, evidence: "Inbox has no rows in demo agency" };
  }

  const firstRow = rows.first();
  const rowSelects = firstRow.locator("select");
  const n = await rowSelects.count();
  if (n < 3) {
    return { pass: false, evidence: `expected source/owner/stage selects in row, got ${n}` };
  }

  // Order in InboxSection: Source (idx 0), Owner (idx 1), Stage (idx 2).
  const sourceSel = rowSelects.nth(0);
  const opts = await sourceSel.locator("option").evaluateAll((els) =>
    els.map((o) => ({ v: o.value, l: o.textContent }))
  );
  const current = await sourceSel.inputValue();
  const next = opts.find((o) => o.v && o.v !== current);
  if (!next) {
    return { pass: false, evidence: `sourceSelect options=${opts.length}, no alternative to '${current}'` };
  }

  consoleErrors.length = 0;
  await sourceSel.selectOption(next.v);
  await page.waitForTimeout(800);

  if (boundaryHit()) {
    return { pass: false, evidence: `boundary on source change: ${consoleErrors.slice(0,3).join(" · ")}` };
  }
  if (await errorPanelCount(page) > 0) {
    return { pass: false, evidence: "Error panel after source change" };
  }
  return { pass: true, evidence: `source '${current}' → '${next.v}', no boundary` };
}

// ─── Test 3: testWriteDealCalc ────────────────────────────────────────────
async function testWriteDealCalc(page) {
  await gotoPage(page, "floor");
  // Floor has a section-pill: Live / Pipeline / Deals / History / Follow-ups
  const dealsTab = page.locator(".section-pill button, button", { hasText: /^Deals$/ }).first();
  if (await dealsTab.count() === 0) {
    return { pass: false, evidence: "Floor Deals tab not found" };
  }
  await dealsTab.click({ timeout: 3000 });
  await page.waitForTimeout(700);

  // Find the AP input (placeholder="2400", type="number") and Comp Rate
  // (placeholder="110"). Both live inside DealWriteForm.
  const apInput = page.locator('input[type="number"][placeholder="2400"]').first();
  const compInput = page.locator('input[type="number"][placeholder="110"]').first();
  if (await apInput.count() === 0 || await compInput.count() === 0) {
    return { pass: false, evidence: `AP input present=${await apInput.count()>0}, Comp input present=${await compInput.count()>0}` };
  }

  consoleErrors.length = 0;
  await apInput.fill("2400");
  await compInput.fill("110");
  // Give React a beat to recompute the useMemo.
  await page.waitForTimeout(400);

  // Expected Commission readout: parent of the "Expected Commission" label.
  // The value div lives adjacent (sibling) to the label. Pull all text near
  // the label and look for the formatted value.
  const labelLoc = page.locator('text="Expected Commission"').first();
  if (await labelLoc.count() === 0) {
    return { pass: false, evidence: "Expected Commission label not visible" };
  }
  // The value div is the next sibling. textContent of the parent grabs both.
  const block = labelLoc.locator("xpath=./..");
  const txt = (await block.innerText()).trim();
  const matches = /\$2[,.]?640(\.00)?/i.test(txt);
  if (!matches) {
    return { pass: false, evidence: `Expected Commission block text='${txt.slice(0,80)}' (wanted $2,640.00)` };
  }
  if (boundaryHit()) {
    return { pass: false, evidence: `boundary during deal calc: ${consoleErrors.slice(0,3).join(" · ")}` };
  }
  return { pass: true, evidence: `Expected Commission='${txt.match(/\$[\d,.]+/)?.[0] || txt.slice(0,40)}'` };
}

// ─── Test 4: testCallRecorderHeader ───────────────────────────────────────
async function testCallRecorderHeader(page) {
  await gotoPage(page, "floor");
  const liveTab = page.locator(".section-pill button, button", { hasText: /^Live$/ }).first();
  if (await liveTab.count() === 0) {
    return { pass: false, evidence: "Floor Live tab not found" };
  }
  await liveTab.click({ timeout: 3000 });
  await page.waitForTimeout(700);

  // Find the Call recorder panel-h. The <h3> with "Call recorder" anchors it.
  const title = page.locator('h3', { hasText: /^Call recorder$/ }).first();
  if (await title.count() === 0) {
    return { pass: false, evidence: "'Call recorder' title h3 not found on Live tab" };
  }
  // The "idle" status span sits adjacent.
  const status = page.locator('text=/^\\s*idle\\s*$/').first();
  if (await status.count() === 0) {
    return { pass: false, evidence: "'idle' status span not visible (recorder may have auto-started?)" };
  }
  const startBtn = page.locator('button', { hasText: /Start recording/ }).first();
  if (await startBtn.count() === 0) {
    return { pass: false, evidence: "'Start recording' button not visible" };
  }

  const tBox = await title.boundingBox();
  const bBox = await startBtn.boundingBox();
  const sBox = await status.boundingBox();
  if (!tBox || !bBox || !sBox) {
    return { pass: false, evidence: `bounding boxes missing (t=${!!tBox}, b=${!!bBox}, s=${!!sBox})` };
  }
  // The recently-landed single-row layout fix: title + status + button on
  // SAME visual row. Allow 4px Y wiggle for baseline alignment differences.
  const titleY = tBox.y + tBox.height / 2;
  const btnY   = bBox.y + bBox.height / 2;
  const statY  = sBox.y + sBox.height / 2;
  const dyBtn  = Math.abs(titleY - btnY);
  const dyStat = Math.abs(titleY - statY);
  if (dyBtn > 4) {
    return { pass: false, evidence: `Start button is ${dyBtn.toFixed(1)}px off title row (>4px) — single-row layout broken` };
  }
  if (dyStat > 4) {
    return { pass: false, evidence: `idle status is ${dyStat.toFixed(1)}px off title row (>4px)` };
  }
  return { pass: true, evidence: `single-row: dyBtn=${dyBtn.toFixed(1)}px, dyStat=${dyStat.toFixed(1)}px` };
}

// ─── Test 5: testLeadDripDryRunBadge ──────────────────────────────────────
async function testLeadDripDryRunBadge(page) {
  await gotoPage(page, "leaddrip");
  // Badge is in the page header (next to "Lead Drip" title) — text "DRY RUN".
  const badge = page.locator("text=/DRY RUN/i").first();
  if (await badge.count() === 0) {
    return { pass: false, evidence: "DRY RUN badge missing from Lead Drip page header" };
  }
  if (!(await badge.isVisible())) {
    return { pass: false, evidence: "DRY RUN badge found in DOM but not visible" };
  }
  const txt = (await badge.innerText()).trim();
  return { pass: true, evidence: `badge text='${txt}'` };
}

// ─── Test 6: testConnectorsTab ────────────────────────────────────────────
async function testConnectorsTab(page) {
  await gotoPage(page, "leaddrip");
  const tab = page.locator("button", { hasText: /^Connectors$/ }).first();
  if (await tab.count() === 0) {
    return { pass: false, evidence: "Connectors tab not present in Lead Drip" };
  }
  consoleErrors.length = 0;
  await tab.click({ timeout: 3000 });
  await page.waitForTimeout(1200); // sources query takes a beat

  if (boundaryHit()) {
    return { pass: false, evidence: `boundary on Connectors click: ${consoleErrors.slice(0,3).join(" · ")}` };
  }
  if (await errorPanelCount(page) > 0) {
    return { pass: false, evidence: "Error panel after Connectors click" };
  }

  // Either the empty state ("No lead sources configured") OR a populated
  // Connectors panel. Both satisfy.
  const empty = page.locator('text=/No lead sources configured/i').first();
  const panel = page.locator('h3', { hasText: /^Connectors$/ }).first();
  const emptyFound = await empty.count() > 0;
  const panelFound = await panel.count() > 0;

  if (!emptyFound && !panelFound) {
    // Loading panel is acceptable in slow networks, but at 1.2s we'd expect
    // the query to have resolved. Fail honestly.
    const loading = await page.locator('text=/Loading sources/i').count();
    return { pass: false, evidence: `Neither empty state nor Connectors panel rendered (loading=${loading})` };
  }

  // If empty state, click "Add GoatLeads webhook (sample)" — assert no boundary.
  if (emptyFound) {
    const addBtn = page.locator('button', { hasText: /Add GoatLeads webhook/i }).first();
    if (await addBtn.count() > 0) {
      consoleErrors.length = 0;
      await addBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1200);
      if (boundaryHit()) {
        return { pass: false, evidence: `boundary on Add GoatLeads click: ${consoleErrors.slice(0,3).join(" · ")}` };
      }
      if (await errorPanelCount(page) > 0) {
        return { pass: false, evidence: "Error panel after Add GoatLeads click" };
      }
      return { pass: true, evidence: "empty-state Add GoatLeads click clean" };
    }
    return { pass: true, evidence: "empty state shown, no Add button to click" };
  }
  return { pass: true, evidence: "Connectors panel rendered (sources configured)" };
}

// ─── Runner ───────────────────────────────────────────────────────────────
const TESTS = [
  ["testEnrollLead",          testEnrollLead],
  ["testEditCrmSource",       testEditCrmSource],
  ["testWriteDealCalc",       testWriteDealCalc],
  ["testCallRecorderHeader",  testCallRecorderHeader],
  ["testLeadDripDryRunBadge", testLeadDripDryRunBadge],
  ["testConnectorsTab",       testConnectorsTab],
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text();
    if (isBenignConsoleError(text)) return;
    consoleErrors.push(text);
  }
});
page.on("pageerror", (err) => consoleErrors.push("[pageerror] " + (err.message || String(err))));

console.log(`smoke:interactions → ${BASE}?demo=1`);
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500); // demo seed + hydrate

// Switch to super_admin first; demo's role-switch shows it. super_admin sees
// every nav target our tests need (leaddrip, crm, floor).
await switchRole(page, "manager");

const results = [];
let pass = 0;
let fail = 0;
for (let i = 0; i < TESTS.length; i++) {
  const [name, fn] = TESTS[i];
  const start = Date.now();
  // Hard-reset console sink before each test so cross-test noise doesn't
  // pollute the assertion.
  consoleErrors.length = 0;
  let res;
  try {
    res = await fn(page);
  } catch (e) {
    res = { pass: false, evidence: `thrown: ${e.message || String(e)}` };
  }
  const ms = Date.now() - start;
  if (res.pass) {
    pass++;
    console.log(`  ✓ ${name}  (${ms}ms)  ${res.evidence}`);
    results.push({ name, pass: true, evidence: res.evidence, ms });
  } else {
    fail++;
    const shot = await snapEvidence(name, i + 1, page);
    console.log(`  ✘ ${name}  (${ms}ms)  ${res.evidence} → ${shot}`);
    results.push({ name, pass: false, evidence: res.evidence, ms, screenshot: shot });
  }
}

await ctx.close();
await browser.close();

const summaryPath = join(ARTIFACT_DIR, "interactions-summary.json");
await writeFile(summaryPath, JSON.stringify({
  base: BASE,
  ts: new Date().toISOString(),
  pass,
  fail,
  results,
}, null, 2));

console.log(`\nresults: ${pass} pass · ${fail} fail`);
for (const r of results) {
  console.log(`  ${r.pass ? "✓" : "✘"} ${r.name}`);
}
console.log(`summary → ${summaryPath}`);

if (fail > 0) process.exit(1);
