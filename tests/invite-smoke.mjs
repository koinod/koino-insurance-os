// Headless smoke for invite + downline UI: walks /?demo=1 through manager +
// super_admin roles, exercises Recruiting + Tree + Settings → Invites, and
// asserts no error boundary trips.
import { chromium } from "playwright";

const BASE = (process.env.SMOKE_URL || "https://repflow.koino.capital").replace(/\/$/, "");
const targets = [
  { role: "manager",     pages: ["recruits", "tree", "downline"] },
  { role: "super_admin", pages: ["recruits", "tree", "downline", "admin"] },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("[pageerror] " + (e.message || String(e))));

console.log(`smoke → ${BASE}/?demo=1`);
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const results = [];
for (const t of targets) {
  const btn = page.locator(`.role-switch button[title="${t.role}"]`).first();
  if (await btn.count() > 0) await btn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);

  for (const p of t.pages) {
    errs.length = 0;
    const start = Date.now();
    try {
      await page.evaluate((tgt) => window.gotoPage && window.gotoPage(tgt), p);
      await page.waitForTimeout(900);
      const errPanel = await page.locator('text="This panel hit an error."').count();
      const crash = errs.find((e) => /Minified React error|TypeError|ReferenceError/i.test(e));
      results.push({ where: `${t.role}/${p}`, ok: !errPanel && !crash, errPanel, errs: errs.slice(0, 3), ms: Date.now() - start });
    } catch (e) {
      results.push({ where: `${t.role}/${p}`, ok: false, thrown: String(e) });
    }
  }
}

// Try to find the invite panel + Generate button under super_admin/recruits
const sa = page.locator(`.role-switch button[title="super_admin"]`).first();
if (await sa.count() > 0) await sa.click({ timeout: 3000 }).catch(() => {});
await page.evaluate(() => window.gotoPage && window.gotoPage("recruits"));
await page.waitForTimeout(800);

const invitePanel = await page.locator('h3:has-text("Invite team")').count();
const genBtn = await page.locator('button:has-text("Generate link")').count();
const demoBanner = await page.locator('text="demo mode — invites won\'t persist"').count();
results.push({ where: "super_admin/recruits.invite-panel", ok: invitePanel > 0 && genBtn > 0, invitePanel, genBtn, demoBanner });

// Click Generate link in demo mode → should show error toast (no JWT), not crash
errs.length = 0;
if (genBtn > 0) {
  await page.locator('button:has-text("Generate link")').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const errBubble = await page.locator('text="Not signed in"').count();
  const crash = errs.find((e) => /Minified React error|TypeError|ReferenceError/i.test(e));
  results.push({ where: "super_admin/recruits.generate-click", ok: !crash, errBubble, errs: errs.slice(0, 3) });
}

await browser.close();

console.log("\n=== UI smoke results ===");
let failed = 0;
for (const r of results) {
  const sigil = r.ok ? "✓" : "✘";
  console.log(`${sigil} ${r.where}  ${JSON.stringify({ ...r, where: undefined, ok: undefined })}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
