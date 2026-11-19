// Builds report.html: one self-contained file the builder sends to the tester.
//
// Everything is inline: styles, the corrections script, and the fonts (as
// data: URLs). A Content-Security-Policy in the file forbids every outside
// request, so opening it fetches nothing. The only links out are the mentor
// profile links, which open only when the tester taps them.
import { mentorUrl, type Mentor } from './mentors';
import { effectiveOffGoalPicks, scoreOf, verdictMap, type ReviewWork } from './review';
import { BUCKETS, BUCKET_LABEL, NOT_ENOUGH_TEXT, SCORE_LABEL, sharePercent, type Bucket } from './scoring';
import { APP_LABEL, attributedEvents, type AccountViews } from './summary';

export const REPORT_FILE_NAME = 'report.html';
export const EXAMPLES_PER_BUCKET = 5;

/** Font files as data: URLs. Any may be missing; the report then falls back to system fonts. */
export interface ReportFonts {
  syne700?: string;
  syne800?: string;
  dmSans400?: string;
  dmSans700?: string;
  dmMono400?: string;
}

export const REPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/** Escapes text for HTML element content and quoted attribute values. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON safe to place inside a <script> element. */
const scriptJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');

const BUCKET_INTRO: Record<Bucket, string> = {
  'on-goal': 'Accounts whose posts serve your goal.',
  neutral: 'Accounts that neither help nor hurt your goal.',
  'off-goal': 'Accounts that pull away from your goal.',
};

const fmt = (n: number) => n.toLocaleString('en-AU');
function day(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function fontFaces(f: ReportFonts): string {
  const face = (family: string, weight: number, url?: string) =>
    url && /^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/.test(url)
      ? `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${url}) format('woff2');}`
      : '';
  return [face('Syne', 700, f.syne700), face('Syne', 800, f.syne800), face('DM Sans', 400, f.dmSans400), face('DM Sans', 700, f.dmSans700), face('DM Mono', 400, f.dmMono400)].join('\n');
}

function ring(percent: number | null): string {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = percent === null ? 0 : (Math.max(0, Math.min(100, percent)) / 100) * c;
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
<circle cx="60" cy="60" r="${r}" fill="none" stroke="#2a2a2a" stroke-width="12"/>
<circle cx="60" cy="60" r="${r}" fill="none" stroke="#FFB84D" stroke-width="12" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 60 60)"/>
</svg>`;
}

function accountRow(a: AccountViews, attributed: number, bucket: Bucket, id: string): string {
  const share = sharePercent(a.views, attributed);
  return `<li class="acct" data-account="${esc(a.name)}" data-bucket="${bucket}">
<div class="acct-line"><span class="acct-name">${esc(a.name)}</span><span class="acct-num">${share}%<span class="sr"> of posts you viewed</span></span></div>
<button type="button" class="wrong" aria-expanded="false" aria-controls="${id}">This is wrong</button>
<div class="fix" id="${id}" hidden>
<label for="${id}-s">Where does <span class="acct-name-inline">${esc(a.name)}</span> belong?</label>
<select id="${id}-s" data-account="${esc(a.name)}">
<option value="">Leave as ${esc(BUCKET_LABEL[bucket].toLowerCase())}</option>
${BUCKETS.filter((b) => b !== bucket)
  .map((b) => `<option value="${b}">${esc(BUCKET_LABEL[b])}</option>`)
  .join('')}
<option value="dont-know">I do not know this account</option>
</select>
</div>
</li>`;
}

function mentorCard(m: Mentor, app: ReviewWork['summary']['app']): string {
  const title = m.name || `@${m.handle}`;
  return `<li class="card mentor">
<h3>${esc(title)}</h3>
${m.name ? `<p class="mono muted">@${esc(m.handle)}</p>` : ''}
<p>${esc(m.reason)}</p>
<a class="btn" href="${esc(mentorUrl(m))}" target="_blank" rel="noopener noreferrer">Open ${esc(title)} on ${APP_LABEL[app]}</a>
</li>`;
}

/** Report text for the corrections the tester gathers. Shared by the inline script (as source) and tests. */
function correctionsScript(meta: { goal: string; made: string; buckets: Record<string, Bucket> }): string {
  return `(function(){
var META=${scriptJson(meta)};
var LABEL={"on-goal":"on-goal","neutral":"neutral","off-goal":"off-goal","dont-know":"I do not know this account"};
var picks={};
var out=document.getElementById("corrections");
var note=document.getElementById("note");
var copied=document.getElementById("copied");
function render(){
  var names=Object.keys(picks);
  var lines=["Corrections to my Algorithm Health report ("+META.made+")",""];
  if(!names.length){lines.push("No corrections chosen yet.");}
  names.forEach(function(n){
    var was=META.buckets[n]||"unclassified";
    lines.push("- "+n+": report says "+was+"; I say "+LABEL[picks[n]]+".");
  });
  if(note&&note.value.trim()){lines.push("","Note: "+note.value.trim());}
  out.value=lines.join("\\n");
  var count=document.getElementById("count");
  if(count){count.textContent=names.length===1?"1 correction":names.length+" corrections";}
}
Array.prototype.forEach.call(document.querySelectorAll("button.wrong"),function(b){
  b.addEventListener("click",function(){
    var panel=document.getElementById(b.getAttribute("aria-controls"));
    var open=b.getAttribute("aria-expanded")==="true";
    b.setAttribute("aria-expanded",open?"false":"true");
    panel.hidden=open;
    if(!open){var s=panel.querySelector("select");if(s){s.focus();}}
  });
});
Array.prototype.forEach.call(document.querySelectorAll(".fix select"),function(s){
  s.addEventListener("change",function(){
    var n=s.getAttribute("data-account");
    if(s.value){picks[n]=s.value;}else{delete picks[n];}
    Array.prototype.forEach.call(document.querySelectorAll(".fix select"),function(o){
      if(o!==s&&o.getAttribute("data-account")===n){o.value=s.value;}
    });
    render();
  });
});
if(note){note.addEventListener("input",render);}
document.getElementById("copy").addEventListener("click",function(){
  render();
  function done(ok){copied.textContent=ok?"Copied. Paste it into a message to the person who sent you this report.":"Could not copy. Select the text above and copy it by hand.";}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out.value).then(function(){done(true);},function(){out.select();done(document.execCommand&&document.execCommand("copy"));});}
  else{out.select();done(document.execCommand&&document.execCommand("copy"));}
});
render();
})();`;
}

export interface ReportReadiness {
  ready: boolean;
  missing: string[];
}

/** What must be done in /review before the report can be exported. */
export function reportReadiness(work: ReviewWork): ReportReadiness {
  const missing: string[] = [];
  if (work.classifications.length === 0) missing.push('Paste and apply the assistant’s answer.');
  const offGoal = work.classifications.some((c) => c.verdict === 'off-goal');
  if (offGoal && !work.offGoalConfirmed) missing.push('Confirm the top three off-goal accounts.');
  if (work.mentors.length === 0) missing.push('Add at least one mentor.');
  return { ready: missing.length === 0, missing };
}

export function buildReportHtml(work: ReviewWork, fonts: ReportFonts = {}, now: Date = new Date()): string {
  const { summary } = work;
  const s = scoreOf(work);
  const attributed = attributedEvents(summary);
  const verdicts = verdictMap(work.classifications);
  const byBucket: Record<Bucket, AccountViews[]> = { 'on-goal': [], neutral: [], 'off-goal': [] };
  for (const a of summary.accounts) {
    const v = verdicts.get(a.name)?.verdict;
    if (v === 'on-goal' || v === 'neutral' || v === 'off-goal') byBucket[v].push(a);
  }
  const picks = effectiveOffGoalPicks(work);
  const picksViews = picks.reduce((n, a) => n + a.views, 0);
  const made = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const bucketsForScript: Record<string, Bucket> = {};
  let rowId = 0;

  const sections = BUCKETS.map((b) => {
    const examples = byBucket[b].slice(0, EXAMPLES_PER_BUCKET);
    for (const a of examples) bucketsForScript[a.name] = b;
    const total = byBucket[b].reduce((n, a) => n + a.views, 0);
    return `<section class="card" aria-labelledby="h-${b}">
<h2 id="h-${b}">${esc(BUCKET_LABEL[b])}</h2>
<p class="muted">${esc(BUCKET_INTRO[b])} <span class="mono">${fmt(byBucket[b].length)} ${byBucket[b].length === 1 ? 'account' : 'accounts'}, ${fmt(total)} views.</span></p>
${
  examples.length
    ? `<p class="label">${examples.length === 1 ? 'Example' : `Top ${examples.length} examples`}, with share of posts you viewed</p>
<ul class="accts">${examples.map((a) => accountRow(a, attributed, b, `fix-${++rowId}`)).join('\n')}</ul>`
    : '<p class="muted">No accounts in this group.</p>'
}
</section>`;
  }).join('\n');

  for (const a of picks) bucketsForScript[a.name] = 'off-goal';
  const picksSection = picks.length
    ? `<section class="card" aria-labelledby="h-picks">
<h2 id="h-picks">${picks.length === 1 ? 'The account' : `The ${picks.length === 3 ? 'three' : 'two'} accounts`} pulling furthest from your goal</h2>
<p class="big-line"><span class="mono accent">${sharePercent(picksViews, attributed)}%</span> of the posts you viewed came from ${picks.length === 1 ? 'this account' : 'these accounts together'}.</p>
<ul class="accts">${picks.map((a) => accountRow(a, attributed, 'off-goal', `fix-${++rowId}`)).join('\n')}</ul>
<p class="muted">Unfollowing or muting them is the quickest way to change the number above.</p>
</section>`
    : '';

  const mentorsSection = work.mentors.length
    ? `<section aria-labelledby="h-mentors" class="stack">
<h2 id="h-mentors">Who to follow instead</h2>
<p class="muted">Picked by hand for your goal. You do not follow ${work.mentors.length === 1 ? 'this account' : 'these accounts'} yet.</p>
<ul class="mentors">${work.mentors.map((m) => mentorCard(m, summary.app)).join('\n')}</ul>
</section>`
    : '';

  const scoreBlock = s.enough
    ? `<div class="ring-wrap">${ring(s.goalMatchPercent)}<div class="ring-text"><span class="score">${s.goalMatchPercent}%</span></div></div>
<p class="score-label">${esc(SCORE_LABEL)} served your goal</p>`
    : `<div class="ring-wrap">${ring(null)}<div class="ring-text"><span class="score-none">${esc(NOT_ENOUGH_TEXT)}</span></div></div>
<p class="score-label">Too few of the accounts you viewed could be sorted to give a fair number.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<title>Your Algorithm Health report</title>
<style>
${fontFaces(fonts)}
:root{color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#080808;color:#F2F2F2;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:17px;line-height:1.5;-webkit-text-size-adjust:100%}
main{max-width:640px;margin:0 auto;padding:24px 16px 64px;display:flex;flex-direction:column;gap:20px}
h1,h2,h3{font-family:'Syne',system-ui,sans-serif;font-weight:700;line-height:1.15;margin:0;text-wrap:balance}
h1{font-size:1.9rem;font-weight:800}h2{font-size:1.3rem}h3{font-size:1.1rem}
p{margin:0}
a{color:#FFB84D}
:focus-visible{outline:3px solid #FFB84D;outline-offset:2px}
.card{background:#141414;border:1px solid #2a2a2a;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.stack{display:flex;flex-direction:column;gap:12px}
.muted{color:#B8B8B8}
.mono,.label,.acct-num{font-family:'DM Mono',ui-monospace,Menlo,Consolas,monospace}
.label{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#B8B8B8}
.accent{color:#FFB84D}
.goal{font-size:1.2rem;border-left:3px solid #FFB84D;padding-left:12px;overflow-wrap:anywhere}
.ring-wrap{position:relative;width:220px;max-width:100%;margin:8px auto 0}
.ring{display:block;width:100%;height:auto}
.ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:36px}
.score{font-family:'Syne',system-ui,sans-serif;font-weight:800;font-size:3.4rem;color:#FFB84D;line-height:1}
.score-none{font-family:'Syne',system-ui,sans-serif;font-weight:700;font-size:1.05rem;line-height:1.2}
.score-label{text-align:center;color:#B8B8B8}
.coverage{font-family:'DM Mono',ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;color:#B8B8B8;text-align:center}
.big-line{font-size:1.1rem}.big-line .mono{font-size:1.4rem}
ul.accts,ul.mentors{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
ul.mentors{gap:12px}
.acct{border-top:1px solid #2a2a2a;padding:10px 0;display:flex;flex-direction:column;gap:6px}
.acct-line{display:flex;justify-content:space-between;gap:12px}
.acct-name,.acct-name-inline{overflow-wrap:anywhere}
.acct-num{color:#B8B8B8;white-space:nowrap}
.btn,button,select,textarea{font:inherit;color:#F2F2F2}
.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid #555;background:transparent;text-decoration:none;cursor:pointer;text-align:center}
.btn:hover,button:hover{border-color:#FFB84D}
button.wrong{align-self:flex-start;min-height:44px;font-size:.9rem;color:#B8B8B8}
button.primary{background:#FFB84D;border-color:#FFB84D;color:#080808;font-weight:700}
.fix{display:flex;flex-direction:column;gap:6px}
.fix[hidden]{display:none}
select,textarea{width:100%;min-height:48px;padding:10px 12px;border-radius:10px;border:1px solid #555;background:#0d0d0d}
textarea{min-height:120px;resize:vertical}
textarea.out{font-family:'DM Mono',ui-monospace,Menlo,Consolas,monospace;font-size:.85rem}
label{font-weight:500}
.mentor .btn{align-self:flex-start}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
footer{color:#B8B8B8;font-size:.9rem;display:flex;flex-direction:column;gap:8px}
@media (min-width:720px){h1{font-size:2.3rem}}
</style>
</head>
<body>
<main>
<header class="stack">
<p class="label">Algorithm Health report &middot; ${esc(APP_LABEL[summary.app])}</p>
<h1>How much of your feed serves your goal</h1>
</header>
<section class="card" aria-labelledby="h-goal">
<h2 id="h-goal" class="label">Your goal, in your words</h2>
<p class="goal">${esc(summary.goal)}</p>
</section>
<section class="card" aria-labelledby="h-score">
<h2 id="h-score" class="sr">Goal match</h2>
${scoreBlock}
<p class="coverage">Coverage ${s.coveragePercent}%: ${fmt(s.classified)} of the ${fmt(attributed)} posts you viewed from named accounts were sorted, ${day(summary.rangeStart)} to ${day(summary.rangeEnd)}.</p>
<p class="muted">Counted in posts and videos viewed, not time spent: your export does not record watch time. Accounts that could not be judged from their name are left out, not counted against you.</p>
</section>
${picksSection}
${sections}
${mentorsSection}
<section class="card" aria-labelledby="h-wrong">
<h2 id="h-wrong">Got something wrong?</h2>
<p>Press <strong>This is wrong</strong> next to any account above and say where it belongs. Your corrections are gathered here. Copy them and send them back; nothing is sent from this page.</p>
<p class="mono muted" id="count" aria-live="polite">0 corrections</p>
<label for="note">Anything else to add (optional)</label>
<textarea id="note"></textarea>
<label for="corrections">Text to send back</label>
<textarea id="corrections" class="out" readonly></textarea>
<button type="button" class="primary" id="copy">Copy corrections</button>
<p id="copied" class="muted" role="status" aria-live="polite"></p>
</section>
<footer>
<p>This report was made by hand for you on ${esc(made)}, from the summary file you shared. It holds the names of accounts you viewed, so it is for you only.</p>
<p>In 7 to 14 days you will be asked for a second export, to see whether anything changed.</p>
</footer>
</main>
<script>${correctionsScript({ goal: summary.goal, made, buckets: bucketsForScript })}</script>
</body>
</html>
`;
}
