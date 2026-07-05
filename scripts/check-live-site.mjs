import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fresh profile, no cache at all
const userDataDir = await mkdtemp(join(tmpdir(), 'pw-fresh-'));
const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  args: ['--disable-cache', '--disable-application-cache', '--disk-cache-size=0'],
});

const page = await browser.newPage();

const loadedScripts = [];
page.on('response', response => {
  const url = response.url();
  if (url.includes('page-licensing') || url.includes('licensing-study')) {
    loadedScripts.push(url);
  }
});

console.log('Loading page with zero-cache fresh profile...');
const resp = await page.goto('https://repflow.koino.capital/licensing', { waitUntil: 'networkidle', timeout: 30000 });

const src = await page.content();
const match = src.match(/deploy:[^-]+-[^"'>]*/);
console.log('Deploy stamp in HTML:', match?.[0] || 'NOT FOUND');

const licLine = src.match(/page-licensing[^"']*/)?.[0];
console.log('Script ref in HTML:', licLine);

console.log('HTTP etag:', resp?.headers()?.['etag']);
console.log('x-vercel-cache:', resp?.headers()?.['x-vercel-cache']);

await page.waitForTimeout(3000);
console.log('\nLoaded scripts:', loadedScripts);

const bodyText = await page.$eval('body', el => el.innerText);
console.log('\nContains "100q":', bodyText.includes('100q'));
console.log('Contains "State Exam":', bodyText.includes('State Exam'));
console.log('Contains "Single Question":', bodyText.includes('Single Question'));

const buttons = await page.$$eval('button', btns =>
  btns.map(b => b.textContent.trim()).filter(t => t.includes('q') || t.includes('Exam') || t.includes('Question'))
);
console.log('\nExam buttons:', buttons);

await browser.close();
