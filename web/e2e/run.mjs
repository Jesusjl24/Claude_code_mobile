// Real-browser check of the whole flow, using only the made-up fixtures.
//
//   npm run build && npm run fixtures && npm run e2e
//
// Needs Chromium for Playwright (`npx playwright install chromium`).
// This is not part of `npm test`; it is how the screens were checked in a
// desktop Chromium at 390px wide. It proves nothing about a real phone.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const fixtures = join(here, '..', 'fixtures');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
if (!existsSync(join(dist, 'index.html'))) throw new Error('Run `npm run build` first.');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(dist, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(dist, '404.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function newPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  return { context, page, requests, problems };
}

/** Layout checks that matter on a 390px screen. */
async function checkScreen(page, name) {
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small = [];
    for (const el of document.querySelectorAll('button, a.btn, input[type=file], select, textarea, input[type=text], summary')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height < 44 && el.tagName !== 'SUMMARY') small.push(`${el.tagName} "${(el.textContent || el.id).trim().slice(0, 30)}" ${Math.round(b.height)}px`);
    }
    const unlabelled = [];
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const labelled = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      if (!labelled) unlabelled.push(el.outerHTML.slice(0, 80));
    }
    const h1 = document.querySelectorAll('h1').length;
    const emoji = /\p{Extended_Pictographic}/u.test(document.body.innerText);
    return { overflow, small, unlabelled, h1, emoji, focusOnHeading: document.activeElement?.tagName === 'H1' };
  });
  check(`${name}: no sideways scroll`, r.overflow <= 0, `overflow ${r.overflow}px`);
  check(`${name}: controls at least 44px tall`, r.small.length === 0, r.small.join('; '));
  check(`${name}: every input has a label`, r.unlabelled.length === 0, r.unlabelled.join('; '));
  check(`${name}: exactly one h1`, r.h1 === 1, `${r.h1}`);
  check(`${name}: no emoji`, !r.emoji);
  await page.screenshot({ path: join(out, `${name.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true });
  return r;
}

async function scanFlow(app, fixture, saveAs, { keyboard = false } = {}) {
  const { context, page, requests, problems } = await newPage(390, 844);
  await page.goto(`${origin}/scan`);
  const label = `/scan ${fixture}`;
  let s = await checkScreen(page, `${label} 1 welcome`);
  check(`${label}: focus starts on the heading`, s.focusOnHeading);
  if (keyboard) {
    // Keyboard only: Tab to the Start button, Enter.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
  } else await page.getByRole('button', { name: 'Start' }).click();

  await page.getByRole('button', { name: 'Next' }).click();
  check(`${label}: empty goal is refused with a message`, await page.getByRole('alert').isVisible());
  await page.getByLabel('The goal you want your feed to serve').fill('Get better at writing code');
  s = await checkScreen(page, `${label} 2 goal`);
  if (keyboard) await page.keyboard.press('Tab'), await page.keyboard.press('Tab'), await page.keyboard.press('Enter');
  else await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: app === 'youtube' ? 'YouTube' : 'Instagram' }).check();
  s = await checkScreen(page, `${label} 3 app`);
  await page.getByRole('button', { name: 'I have my zip file' }).click();

  s = await checkScreen(page, `${label} 4 file`);
  check(`${label}: focus moved to the new heading`, s.focusOnHeading);
  const before = requests.length;
  await page.locator('#export-file').setInputFiles(join(fixtures, fixture));
  return { context, page, requests, problems, before, label };
}

async function finishScan(run, saveAs) {
  const { context, page, requests, problems, before, label } = run;
  await page.getByRole('heading', { name: 'This is what will be shared' }).waitFor({ timeout: 120_000 });
  check(`${label}: no network request during the scan`, requests.length === before, requests.slice(before).join(', '));
  await checkScreen(page, `${label} 5 preview`);
  const topCount = await page.locator('.rank-list li').count();
  check(`${label}: preview lists the top ten accounts`, topCount === 10, `${topCount}`);
  await page.getByRole('button', { name: 'Next' }).click();

  await checkScreen(page, `${label} 6 consent`);
  await page.getByRole('button', { name: 'Next' }).click();
  check(`${label}: cannot continue without ticking consent`, await page.getByRole('alert').isVisible());
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Next' }).click();

  await checkScreen(page, `${label} 7 save`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Save algorithm-health-summary\.json/ }).click()]);
  check(`${label}: file is named algorithm-health-summary.json`, download.suggestedFilename() === 'algorithm-health-summary.json');
  await download.saveAs(join(out, saveAs));
  const saved = JSON.parse(readFileSync(join(out, saveAs), 'utf8'));
  check(`${label}: saved file has exactly the ten spec fields`, Object.keys(saved).length === 10 && saved.goal === 'Get better at writing code');
  check(`${label}: every request went to the site itself`, requests.every((u) => u.startsWith(origin) || u.startsWith('blob:') || u.startsWith('data:')), requests.filter((u) => !u.startsWith(origin)).join(', '));
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, dbs: (await indexedDB.databases()).length }));
  check(`${label}: nothing in browser storage`, storage.local === 0 && storage.session === 0 && storage.cookies === '' && storage.dbs === 0, JSON.stringify(storage));
  check(`${label}: no console errors`, problems.length === 0, problems.join(' | '));
  await context.close();
  return saved;
}

// ---- /scan ----
const ytFirst = await finishScan(await scanFlow('youtube', 'youtube-normal.zip'), 'youtube-first-summary.json');
await finishScan(await scanFlow('youtube', 'youtube-normal-second.zip', null, { keyboard: true }), 'youtube-second-summary.json');
await finishScan(await scanFlow('instagram', 'instagram-normal.zip'), 'instagram-first-summary.json');
await finishScan(await scanFlow('instagram', 'instagram-normal-second.zip'), 'instagram-second-summary.json');

for (const [app, fixture, expected] of [
  ['youtube', 'youtube-html.zip', /change the history format from HTML to JSON/],
  ['youtube', 'youtube-unexpected.zip', /does not look like a YouTube export/],
  ['youtube', 'youtube-empty.zip', /no watch history/],
  ['instagram', 'instagram-html.zip', /choose "JSON"/],
  ['instagram', 'instagram-unexpected.zip', /does not look like an Instagram export/],
  ['instagram', 'instagram-empty.zip', /no viewed posts or videos/],
  ['instagram', 'youtube-normal.zip', /looks like a YouTube export/],
]) {
  const run = await scanFlow(app, fixture);
  const alert = run.page.getByRole('alert');
  await alert.waitFor();
  const text = await alert.innerText();
  check(`${run.label}: plain error message`, expected.test(text), text.slice(0, 120));
  check(`${run.label}: lists the file names found`, (await run.page.locator('.alert .file-list li').count()) > 0);
  check(`${run.label}: no network request`, run.requests.length === run.before);
  await checkScreen(run.page, `${run.label} error`);
  await run.context.close();
}

// ---- large fixtures: memory and time in desktop Chromium ----
for (const [app, fixture] of [['youtube', 'youtube-large.zip'], ['instagram', 'instagram-large.zip']]) {
  if (!existsSync(join(fixtures, fixture))) {
    check(`${fixture} exists (run npm run fixtures)`, false);
    continue;
  }
  const run = await scanFlow(app, fixture);
  const started = Date.now();
  let peak = 0;
  const timer = setInterval(async () => {
    const used = await run.page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0).catch(() => 0);
    if (used > peak) peak = used;
  }, 100);
  await run.page.getByRole('heading', { name: 'This is what will be shared' }).waitFor({ timeout: 300_000 });
  clearInterval(timer);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const mb = Math.round(peak / 1e6);
  check(`${fixture}: 210,000 events scanned in desktop Chromium`, true, `${seconds}s, peak JS heap about ${mb} MB (sampled)`);
  check(`${fixture}: peak JS heap under 300 MB`, mb < 300, `${mb} MB`);
  await run.context.close();
}

export const state = { ytFirst };
// REVIEW-AND-COMPARE-CHECKS (added with milestones 7 to 9)

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
