import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Log all script loads
const loadedScripts = [];
page.on('response', response => {
  const url = response.url();
  if (url.includes('page-licensing') || url.includes('licensing-study')) {
    loadedScripts.push({ url, status: response.status(), headers: response.headers() });
  }
});

console.log('Loading page...');
const response = await page.goto('https://repflow.koino.capital/licensing', { waitUntil: 'domcontentloaded', timeout: 30000 });

// Get raw HTML immediately to see what index.html was served
const pageSource = await page.content();
const licensingLine = pageSource.match(/page-licensing[^"']*/)?.[0];
console.log('Index.html references:', licensingLine);

// Check x-vercel-cache on the HTML response
const respHeaders = response?.headers() || {};
console.log('HTML x-vercel-cache:', respHeaders['x-vercel-cache']);
console.log('HTML x-vercel-id:', respHeaders['x-vercel-id']);
console.log('HTML age:', respHeaders['age']);
console.log('HTML etag:', respHeaders['etag']);

await page.waitForTimeout(5000);

console.log('\nLoaded scripts:');
for (const s of loadedScripts) {
  console.log(` - ${s.url}`);
  console.log(`   status: ${s.status}, age: ${s.headers['age']}, cache: ${s.headers['x-vercel-cache']}, content-length: ${s.headers['content-length']}`);
}

const bodyText = await page.$eval('body', el => el.innerText);
console.log('\nContains "100q":', bodyText.includes('100q'));
console.log('Contains "State Exam":', bodyText.includes('State Exam'));
console.log('Contains "Single Question":', bodyText.includes('Single Question'));

await browser.close();
