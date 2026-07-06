import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', err => {
  consoleErrors.push(err.message);
});

console.log('Navigating to local site...');
await page.goto('http://localhost:8080/?demo=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Switch to rep role
const repBtn = page.locator('.role-switch button[title="rep"]').first();
if (await repBtn.count() > 0) {
  await repBtn.click();
} else {
  await page.evaluate(() => localStorage.setItem('repflow.role', 'rep'));
}
await page.waitForTimeout(1000);

// Navigate to today
await page.evaluate(() => window.gotoPage && window.gotoPage('today'));
await page.waitForTimeout(2000);

// Check if error boundary is rendered
const hasError = await page.locator('text="This panel hit an error."').count() > 0;
console.log('Has Error Boundary:', hasError);

if (hasError) {
  const errorMsg = await page.locator('div[style*="font-family"]').first().innerText().catch(() => 'no msg');
  const details = await page.locator('details').first().innerText().catch(() => 'no details');
  console.log('Error Message:', errorMsg);
  console.log('Details:', details);
}

console.log('Console Errors:', consoleErrors);

await browser.close();
