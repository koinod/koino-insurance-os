import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('Navigating to repflow.koino.capital/licensing ...');
await page.goto('https://repflow.koino.capital/licensing', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);

// Get all button text
const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()));
console.log('\n=== VISIBLE BUTTONS ===');
buttons.forEach(b => b && console.log(' -', b));

// Get the licensing script src to check version number loaded
const scripts = await page.$$eval('script[src]', els => els.map(el => el.getAttribute('src')));
const licensingScripts = scripts.filter(s => s && (s.includes('licensing') || s.includes('study-guide')));
console.log('\n=== LICENSING SCRIPTS LOADED ===');
licensingScripts.forEach(s => console.log(' -', s));

// Check if 100q is rendered anywhere on the page
const bodyText = await page.$eval('body', el => el.innerText);
const has100q = bodyText.includes('100q');
const hasStateExam = bodyText.includes('State Exam');
console.log('\n=== CONTENT CHECK ===');
console.log(' - Contains "100q":', has100q);
console.log(' - Contains "State Exam":', hasStateExam);

// Screenshot for visual confirmation
await page.screenshot({ path: '/tmp/repflow-licensing.png', fullPage: false });
console.log('\n=== SCREENSHOT saved to /tmp/repflow-licensing.png ===');

await browser.close();
