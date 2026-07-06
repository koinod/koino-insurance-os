import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('Navigating to local site...');
await page.goto('http://localhost:8080/?demo=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Check if any error is visible
const errorBanners = await page.$$eval('div', els => 
  els.filter(el => el.textContent.includes('This panel hit an error'))
     .map(el => el.innerText)
);

console.log('\n=== Error Banners on Home ===');
console.log(errorBanners);

// Navigate to today page explicitly
await page.evaluate(() => window.gotoPage && window.gotoPage('today'));
await page.waitForTimeout(2000);

const detailsText = await page.$$eval('details', els => els.map(el => el.innerText));
console.log('\n=== Details on Today Page ===');
console.log(detailsText);

const bodyText = await page.$eval('body', el => el.innerText);
console.log('\n=== Body Text ===');
console.log(bodyText.substring(0, 1000));

await browser.close();
