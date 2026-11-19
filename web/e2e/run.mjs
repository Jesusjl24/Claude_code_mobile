// Real-browser check of the whole flow, using only the made-up fixtures.
//
//   npm run build && npm run fixtures && npm run e2e
//
// Needs Chromium for Playwright (`npx playwright install chromium`).
// This is not part of `npm test`; it is how the screens were checked in a
// desktop Chromium at 390px wide. It proves nothing about a real phone.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
await finishScan(await scanFlow('youtube', 'youtube-normal.zip'), 'youtube-first-summary.json');
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
for (const [app, fixture] of process.env.E2E_SKIP_LARGE ? [] : [['youtube', 'youtube-large.zip'], ['instagram', 'instagram-large.zip']]) {
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


// ---- /review ----
/** A made-up assistant answer: buckets chosen from the topic word in each fixture name. */
function sampleAnswer(requestText) {
  const topicVerdict = { coding: 'on-goal', study: 'on-goal', memes: 'off-goal', gaming: 'off-goal', cooking: 'neutral', fitness: 'neutral', music: 'neutral', news: 'unknown' };
  return requestText
    .split('\n')
    .filter((l) => l.startsWith('{"account"'))
    .map((l) => JSON.parse(l).account)
    .map((account) => {
      const topic = Object.keys(topicVerdict).find((t) => account.toLowerCase().includes(t));
      const bucket = topic ? topicVerdict[topic] : 'unknown';
      return { account, bucket, reason: bucket === 'unknown' ? 'Name alone is not enough to judge.' : `Made-up ${topic} account for the fixture.` };
    });
}

async function reviewFlow(app) {
  const label = `/review ${app}`;
  const { context, page, requests, problems } = await newPage(1280, 900);
  await page.goto(`${origin}/review`);
  await checkScreen(page, `${label} 1 load`);
  await page.locator('#summary-file').setInputFiles(join(fixtures, `${app}-unexpected.zip`));
  check(`${label}: a file that is not a summary is refused`, await page.getByRole('alert').waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.locator('#summary-file').setInputFiles(join(out, `${app}-first-summary.json`));
  await page.getByRole('heading', { name: '1. Copy the classification request' }).waitFor();

  const request = await page.locator('#request-text').inputValue();
  const answer = sampleAnswer(request);
  writeFileSync(join(out, `${app}-sample-answer.json`), JSON.stringify(answer, null, 2) + '\n');
  check(`${label}: request lists accounts and the goal`, answer.length > 5 && request.includes('Get better at writing code'), `${answer.length} accounts`);

  const broken = structuredClone(answer);
  broken[1].bucket = 'bad';
  broken.pop();
  await page.locator('#answer-text').fill(JSON.stringify(broken, null, 2));
  await page.getByRole('button', { name: 'Check and apply' }).click();
  const errText = await page.getByRole('alert').innerText();
  check(`${label}: a wrong answer is refused, naming the entry and line`, /2 problems/.test(errText) && /Entry 2 \(line \d+\)/.test(errText) && /Missing: no entry/.test(errText), errText.slice(0, 160).replace(/\n/g, ' '));
  check(`${label}: nothing applied after a refused answer`, (await page.locator('.score-big').innerText()).includes('Not enough classified'));

  await page.locator('#answer-text').fill('```json\n' + JSON.stringify(answer, null, 2) + '\n```');
  await page.getByRole('button', { name: 'Check and apply' }).click();
  const scoreBefore = await page.locator('.score-big').innerText();
  check(`${label}: a correct answer gives a running goal-match figure`, /^\d+%$/.test(scoreBefore), scoreBefore);

  const firstOn = answer.find((a) => a.bucket === 'on-goal').account;
  await page.getByLabel(`Bucket for ${firstOn}`, { exact: true }).selectOption('off-goal');
  const scoreAfter = await page.locator('.score-big').innerText();
  check(`${label}: overriding a bucket changes the figure and is marked`, scoreAfter !== scoreBefore && (await page.getByText('changed by you').count()) === 1, `${scoreBefore} -> ${scoreAfter}`);
  await page.getByLabel(`Bucket for ${firstOn}`, { exact: true }).selectOption('on-goal');

  const ticked = await page.locator('fieldset input[type=checkbox]:checked').count();
  check(`${label}: three off-goal accounts are pre-ticked`, ticked === 3, `${ticked}`);
  await page.getByRole('button', { name: /Confirm these 3 accounts/ }).click();

  const followed = app === 'youtube' ? ['@example_coding_01', 'Example Coding Channel 01'] : ['example_coding_account_01', ''];
  const mentor = async (appChoice, handle, name, reason) => {
    await page.locator('#mentor-app').selectOption(appChoice);
    await page.locator('#mentor-handle').fill(handle);
    if (appChoice === 'youtube') await page.locator('#mentor-name').fill(name);
    await page.locator('#mentor-reason').fill(reason);
    await page.getByRole('button', { name: 'Add mentor' }).click();
  };
  await mentor(app, followed[0], followed[1], 'Already followed.');
  check(`${label}: a mentor the tester already follows is refused`, /already follows/.test(await page.getByRole('alert').innerText()));
  await mentor(app === 'youtube' ? 'instagram' : 'youtube', '@example_mentor_01', 'Example Mentor Channel 01', 'Wrong app.');
  check(`${label}: a mentor on a different app is refused`, /must be on the same app/.test(await page.getByRole('alert').innerText()));
  await mentor(app, '@example_mentor_01', 'Example Mentor Channel 01', 'Explains one idea per post, step by step.');
  await mentor(app, app === 'youtube' ? 'https://www.youtube.com/@example_mentor_03' : 'https://www.instagram.com/example_mentor_03/', 'Example Mentor Channel 03', 'Short weekly exercises.');
  check(`${label}: valid mentors are added`, (await page.getByRole('list', { name: 'Mentors' }).getByRole('listitem').count()) === 2);
  await checkScreen(page, `${label} 2 full`);

  const [wip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save work in progress' }).click()]);
  await wip.saveAs(join(out, `${app}-review.json`));
  await page.reload();
  await page.locator('#work-file').setInputFiles(join(out, `${app}-review.json`));
  await page.getByRole('heading', { name: '5. Add mentors' }).waitFor();
  check(
    `${label}: saved work reloads with score, confirmation and mentors`,
    (await page.locator('.score-big').innerText()) === scoreBefore && (await page.getByRole('list', { name: 'Mentors' }).getByRole('listitem').count()) === 2 && (await page.getByRole('button', { name: /Confirmed/ }).count()) === 1,
  );


  // ---- report.html ----
  const [rep] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export report.html' }).click()]);
  check(`${label}: report file is named report.html`, rep.suggestedFilename() === 'report.html');
  const reportPath = join(out, `${app}-report.html`);
  await rep.saveAs(reportPath);
  const reportSize = statSync(reportPath).size;
  check(`${label}: report.html is one file under 300 KB`, reportSize < 300_000, `${Math.round(reportSize / 1024)} KB`);
  {
    const r = await newPage(390, 844);
    await r.page.goto(pathToFileURL(reportPath).href);
    await r.page.waitForLoadState('load');
    const outside = r.requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
    check(`${label} report: opening it makes no outside request`, outside.length === 0, outside.join(', '));
    const fontsOk = await r.page.evaluate(async () => {
      await document.fonts.ready;
      return ['800 20px Syne', '400 16px "DM Sans"', '400 16px "DM Mono"'].every((f) => document.fonts.check(f));
    });
    check(`${label} report: embedded fonts load`, fontsOk);
    await checkScreen(r.page, `${label} report`);
    const ring = await r.page.locator('.score, .score-none').first().innerText();
    check(`${label} report: goal-match ring shows a number`, /^\d+%$/.test(ring), ring);
    const firstWrong = r.page.getByRole('button', { name: 'This is wrong' }).first();
    await firstWrong.click();
    check(`${label} report: "This is wrong" opens and focuses a choice`, (await firstWrong.getAttribute('aria-expanded')) === 'true' && (await r.page.evaluate(() => document.activeElement?.tagName)) === 'SELECT');
    await r.page.keyboard.press('ArrowDown');
    await r.page.locator('.fix:not([hidden]) select').first().selectOption('dont-know');
    await r.page.getByLabel('Anything else to add (optional)').fill('Made-up note.');
    const text = await r.page.locator('#corrections').inputValue();
    check(`${label} report: corrections are gathered as text to copy`, /report says .+; I say I do not know this account\./.test(text) && text.includes('Note: Made-up note.'), text.replace(/\n/g, ' | ').slice(0, 160));
    await r.context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await r.page.getByRole('button', { name: 'Copy corrections' }).click();
    const copyMsg = await r.page.locator('#copied').filter({ hasText: /Copied|Could not copy/ }).waitFor({ timeout: 5000 }).then(() => r.page.locator('#copied').innerText(), () => '');
    check(`${label} report: copy confirms`, copyMsg !== '', copyMsg);
    const mentorLinks = await r.page.locator('.mentor a').evaluateAll((as) => as.map((a) => a.href));
    check(`${label} report: mentor cards link to profiles on the scanned app`, mentorLinks.length === 2 && mentorLinks.every((h) => h.includes(app === 'youtube' ? 'youtube.com/@' : 'instagram.com/')), mentorLinks.join(', '));
    check(`${label} report: no console errors`, r.problems.length === 0, r.problems.join(' | '));
    await r.page.screenshot({ path: join(out, `${app}-report-390.png`), fullPage: true });
    await r.context.close();
  }

  // The builder tool is meant for a laptop, but it should not break on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await checkScreen(page, `${label} 3 at 390px`);
  check(`${label}: every request went to the site itself`, requests.every((u) => u.startsWith(origin) || u.startsWith('blob:') || u.startsWith('data:')));
  check(`${label}: no console errors`, problems.length === 0, problems.join(' | '));
  await context.close();
}
await reviewFlow('youtube');
await reviewFlow('instagram');

// COMPARE-CHECKS

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
