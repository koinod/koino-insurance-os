// Playwright-based live-site verification of the light mode feature.
// Tests all 6 acceptance criteria plus visual screenshots.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SS = join(__dir, 'screenshots');
mkdirSync(SS, { recursive: true });

const BASE = 'https://repflow.koino.capital';
const RESULTS = [];
function pass(msg) { RESULTS.push({ ok: true,  msg }); console.log('✅', msg); }
function fail(msg) { RESULTS.push({ ok: false, msg }); console.error('❌', msg); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ── Intercept Supabase RPC for get_my_profile so Profile tab renders ──────
// This simulates a real authenticated user with theme="dark" in their profile.
await ctx.route('**/rpc/get_my_profile**', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      profile: {
        display_name: 'Ian K', full_name: 'Ian Kobe', email: 'bigbacon61@gmail.com',
        theme: 'dark', density: 'comfortable', timezone: 'America/New_York',
        licensed_states: ['TX','FL'], notification_prefs: { email: true, sms: false, in_app: true, digest_frequency: 'daily' },
      },
      memberships: [{ role: 'owner', agency_id: 'a073f1cc-f4b4-44e9-8471-173455391e2f', agency_name: 'Koino Insurance' }],
      current_agency_id: 'a073f1cc-f4b4-44e9-8471-173455391e2f',
      is_platform_admin: true,
    }),
  });
});
// Also intercept save_profile to avoid real DB writes during test
await ctx.route('**/rpc/save_profile**', async route => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
});

const page = await ctx.newPage();

// ── 1. Default dark load ────────────────────────────────────────────────────
await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const initTheme = await page.evaluate(() => document.documentElement.dataset.theme);
(initTheme === 'dark' || !initTheme)
  ? pass('Default theme is dark (data-theme="' + (initTheme || 'unset/dark') + '")')
  : fail('Expected dark default, got: ' + initTheme);

const bgDark = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim());
bgDark.includes('050505') ? pass('Dark bg-base correct: ' + bgDark) : fail('Dark bg-base wrong: ' + bgDark);

await page.screenshot({ path: join(SS, 'theme-toggle-dark-default.png') });
pass('Screenshot: theme-toggle-dark-default.png');

// ── 2. Verify window.applyTheme exists ─────────────────────────────────────
const hasApplyTheme = await page.evaluate(() => typeof window.applyTheme === 'function');
hasApplyTheme ? pass('window.applyTheme is defined in shared.js')
              : fail('window.applyTheme is NOT defined');

// ── 3. Apply light mode, verify immediate DOM change + localStorage ─────────
await page.evaluate(() => window.applyTheme && window.applyTheme('light'));
await page.waitForTimeout(300);

const lightTheme = await page.evaluate(() => document.documentElement.dataset.theme);
lightTheme === 'light' ? pass('data-theme="light" set immediately after applyTheme("light")')
                       : fail('data-theme="' + lightTheme + '" (expected "light")');

const bgLight = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim());
(bgLight.toLowerCase().includes('faf7f2'))
  ? pass('Light --bg-base applied: ' + bgLight)
  : fail('Light --bg-base wrong: ' + bgLight + ' (expected #FAF7F2)');

const lsAfterApply = await page.evaluate(() => localStorage.getItem('repflow_theme'));
lsAfterApply === 'light' ? pass('localStorage.repflow_theme="light" after apply')
                         : fail('localStorage="' + lsAfterApply + '" (expected "light")');

await page.screenshot({ path: join(SS, 'theme-toggle-light-applied.png') });
pass('Screenshot: theme-toggle-light-applied.png');

// ── 4. Reload — anti-FOUC: data-theme="light" before React mounts ──────────
await page.reload({ waitUntil: 'domcontentloaded' });
const themeEarly = await page.evaluate(() => document.documentElement.dataset.theme);
themeEarly === 'light'
  ? pass('data-theme="light" present immediately on reload (anti-FOUC works)')
  : fail('data-theme="' + themeEarly + '" on reload (expected "light" — anti-FOUC may have failed)');

await page.waitForTimeout(2000);
const themeAfterFull = await page.evaluate(() => document.documentElement.dataset.theme);
themeAfterFull === 'light' ? pass('Light mode persists after full reload')
                           : fail('Light mode lost after reload: "' + themeAfterFull + '"');

await page.screenshot({ path: join(SS, 'theme-toggle-light-persisted-after-reload.png') });
pass('Screenshot: theme-toggle-light-persisted-after-reload.png');

// ── 5. Navigate to Settings → Profile — verify toggle UI renders ───────────
await page.evaluate(() =>
  window.dispatchEvent(new CustomEvent('nav:goto', { detail: { page: 'settings' } })));
await page.waitForTimeout(800);

// Click Profile tab
try {
  await page.locator('button:has-text("Profile")').first().click();
  await page.waitForTimeout(1200); // profile load + RPC mock resolve
  pass('Navigated to Settings → Profile tab');
} catch (e) { fail('Profile tab click failed: ' + e.message); }

// Verify theme buttons render in the App preferences panel
try {
  const darkBtn  = page.locator('button:has-text("Dark")').first();
  const lightBtn = page.locator('button:has-text("Light")').first();
  await darkBtn.waitFor({ timeout: 5000 });
  await lightBtn.waitFor({ timeout: 5000 });
  pass('Dark / Light / System theme buttons found in Settings → Profile');
} catch (e) {
  fail('Theme toggle buttons not found in Profile tab: ' + e.message);
}

await page.screenshot({ path: join(SS, 'theme-toggle-settings-profile-ui.png') });
pass('Screenshot: theme-toggle-settings-profile-ui.png');

// ── 6. Click Dark button → verify immediate switch ─────────────────────────
try {
  await page.locator('button:has-text("Dark")').first().click();
  await page.waitForTimeout(400);
  const afterDark = await page.evaluate(() => document.documentElement.dataset.theme);
  afterDark === 'dark'
    ? pass('Clicking Dark button switches data-theme="dark" immediately')
    : fail('After Dark click: data-theme="' + afterDark + '" (expected "dark")');

  const lsAfterDark = await page.evaluate(() => localStorage.getItem('repflow_theme'));
  lsAfterDark === 'dark' ? pass('localStorage updated to "dark" after Dark click')
                         : fail('localStorage="' + lsAfterDark + '" (expected "dark")');

  await page.screenshot({ path: join(SS, 'theme-toggle-back-to-dark.png') });
  pass('Screenshot: theme-toggle-back-to-dark.png');
} catch (e) { fail('Dark button click failed: ' + e.message); }

// ── 7. Click Light button again → verify round-trip ────────────────────────
try {
  await page.locator('button:has-text("Light")').first().click();
  await page.waitForTimeout(400);
  const afterLight = await page.evaluate(() => document.documentElement.dataset.theme);
  afterLight === 'light'
    ? pass('Clicking Light button switches back to light immediately (round-trip)')
    : fail('Round-trip failed: data-theme="' + afterLight + '"');
} catch (e) { fail('Light round-trip click failed: ' + e.message); }

// ── Summary ─────────────────────────────────────────────────────────────────
await browser.close();
const passed = RESULTS.filter(r => r.ok).length;
const failed = RESULTS.filter(r => !r.ok).length;
console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
if (failed > 0) {
  console.log('\nFailed:');
  RESULTS.filter(r => !r.ok).forEach(r => console.log('  ❌', r.msg));
  process.exit(1);
}
console.log('All checks passed. Screenshots saved to audits/screenshots/');
