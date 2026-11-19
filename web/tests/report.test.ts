import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORT_CSP, buildReportHtml, esc, reportReadiness } from '../src/lib/report';
import { applyAssistantAnswer, newReview, type ReviewWork } from '../src/lib/review';
import type { Summary } from '../src/lib/summary';
import type { Verdict } from '../src/lib/scoring';

const names = ['example_coding_account_01', 'example_memes_account_02', 'example_study_account_03', 'example_gaming_account_04', 'example_news_account_05', 'example_memes_account_06', 'example_coding_account_07', 'example_music_account_08'];
const views = [30, 20, 15, 10, 8, 7, 6, 4];
const summary: Summary = {
  schemaVersion: 1,
  app: 'instagram',
  createdAt: '2026-11-10T12:00:00.000Z',
  goal: 'Learn to code <script>alert(1)</script> & "ship"',
  rangeStart: '2026-10-11',
  rangeEnd: '2026-11-10',
  totalViewEvents: 105,
  unattributedEvents: 5,
  accounts: names.map((name, i) => ({ name, views: views[i]! })),
  following: ['example_coding_account_01'],
};
const verdicts: Verdict[] = ['on-goal', 'off-goal', 'on-goal', 'off-goal', 'unknown', 'off-goal', 'on-goal', 'neutral'];
function work(over: Partial<ReviewWork> = {}, v: Verdict[] = verdicts): ReviewWork {
  const w = applyAssistantAnswer(
    newReview(summary),
    names.map((account, i) => ({ account, verdict: v[i]!, reason: 'Made up.' })),
  );
  return {
    ...w,
    offGoalConfirmed: true,
    mentors: [{ app: 'instagram', handle: 'example_mentor_01', name: '', reason: 'Clear <b>tutorials</b>.' }],
    ...over,
  };
}
const NOW = new Date('2026-11-12T00:00:00Z');

describe('report.html', () => {
  const html = buildReportHtml(work(), {}, NOW);

  it('is one self-contained file: no outside scripts, styles, images, frames or fonts', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<(iframe|img|object|embed|video|audio|form)\b/i);
    expect(html).not.toMatch(/\bsrc\s*=/i);
    expect(html).not.toMatch(/@import|url\((?!data:)/i);
    expect(html).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB/);
    expect(html).toContain(`content="${REPORT_CSP}"`);
    expect(REPORT_CSP).toContain("default-src 'none'");
    expect(REPORT_CSP).toContain("connect-src 'none'");
  });

  it('the only outside URLs are the mentor profile links', () => {
    const urls = html.match(/https?:\/\/[^"'\s<)]+/g) ?? [];
    expect(urls).toEqual(['https://www.instagram.com/example_mentor_01/']);
    expect(html).toMatch(/href="https:\/\/www\.instagram\.com\/example_mentor_01\/" target="_blank" rel="noopener noreferrer"/);
  });

  it('escapes the goal, names and reasons', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Learn to code &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;ship&quot;');
    expect(html).toContain('Clear &lt;b&gt;tutorials&lt;/b&gt;.');
    // Inside the inline script the goal is JSON with "<" escaped, so it cannot close the element.
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(esc(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('shows the goal-match ring, the score label and coverage', () => {
    // on-goal 30+15+6=51, off-goal 20+10+7=37, neutral 4: 51/92 = 55%. Coverage 92/100.
    expect(html).toContain('<span class="score">55%</span>');
    expect(html).toContain('share of posts you viewed served your goal');
    expect(html).toContain('Coverage 92%');
    expect(html).toContain('class="ring"');
    expect(html).not.toMatch(/share of your time|time spent on/i);
  });

  it('three bucket sections with up to five examples, top off-goal picks and their combined share', () => {
    for (const h of ['On-goal', 'Neutral', 'Off-goal']) expect(html).toContain(`>${h}</h2>`);
    expect(html).toContain('The three accounts pulling furthest from your goal');
    expect(html).toMatch(/<span class="mono accent">37%<\/span> of the posts you viewed/);
    expect(html).not.toContain('>example_news_account_05<'); // unknown: in no bucket
  });

  it('a "This is wrong" control on every example account', () => {
    const rows = html.match(/<li class="acct"/g)?.length ?? 0;
    const buttons = html.match(/>This is wrong<\/button>/g)?.length ?? 0;
    // 3 on-goal + 1 neutral + 3 off-goal examples, plus 3 picks.
    expect(rows).toBe(10);
    expect(buttons).toBe(rows);
    expect(html).toContain('id="corrections"');
    expect(html).toContain('id="copy"');
  });

  it('caps each bucket at five examples', () => {
    const many: Summary = { ...summary, accounts: Array.from({ length: 9 }, (_, i) => ({ name: `example_coding_${i}`, views: 10 })), totalViewEvents: 95, unattributedEvents: 5 };
    const w = applyAssistantAnswer(newReview(many), many.accounts.map((a) => ({ account: a.name, verdict: 'on-goal' as const, reason: 'x' })));
    const out = buildReportHtml({ ...w, mentors: [] }, {}, NOW);
    expect(out.match(/<li class="acct"/g)).toHaveLength(5);
    expect(out).toContain('9 accounts, 90 views.');
  });

  it('under 60% coverage shows "Not enough classified to score" and no number', () => {
    const low = buildReportHtml(work({}, ['unknown', 'off-goal', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'on-goal']), {}, NOW);
    expect(low).toContain('Not enough classified to score');
    expect(low).not.toMatch(/class="score">/);
    expect(low).toContain('Coverage 24%');
  });

  it('YouTube mentors link to the @handle and show the channel name', () => {
    const yt = buildReportHtml(work({ summary: { ...summary, app: 'youtube' }, mentors: [{ app: 'youtube', handle: 'example_mentor_01', name: 'Example Mentor Channel 01', reason: 'x' }] }), {}, NOW);
    expect(yt).toContain('href="https://www.youtube.com/@example_mentor_01"');
    expect(yt).toContain('Open Example Mentor Channel 01 on YouTube');
  });

  it('embeds only well-formed woff2 data: URLs as fonts', () => {
    const withFont = buildReportHtml(work(), { syne800: 'data:font/woff2;base64,AAAA', dmSans400: 'https://fonts.example.invalid/x.woff2' }, NOW);
    expect(withFont).toContain("src:url(data:font/woff2;base64,AAAA) format('woff2')");
    expect(withFont).not.toContain('fonts.example.invalid');
  });

  it('the inline script parses', () => {
    const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
    expect(() => new Function(script)).not.toThrow();
  });

  it('no emoji', () => {
    expect(/\p{Extended_Pictographic}/u.test(html.replace(/&[a-z#0-9]+;/g, ''))).toBe(false);
  });
});

describe('report readiness', () => {
  it('needs the answer, the off-goal confirmation and a mentor', () => {
    expect(reportReadiness(work()).ready).toBe(true);
    expect(reportReadiness(newReview(summary)).missing).toEqual(['Paste and apply the assistant’s answer.', 'Add at least one mentor.']);
    expect(reportReadiness(work({ offGoalConfirmed: false })).missing).toEqual(['Confirm the top three off-goal accounts.']);
    expect(reportReadiness(work({ mentors: [] })).missing).toEqual(['Add at least one mentor.']);
    // With nothing off-goal there is nothing to confirm.
    expect(reportReadiness(work({ offGoalConfirmed: false }, verdicts.map((v) => (v === 'off-goal' ? 'neutral' : v)))).ready).toBe(true);
  });
});

describe('the report page source', () => {
  it('builds with the bundled fonts', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'lib', 'report-fonts.ts'), 'utf8');
    expect(src.match(/\.woff2\?inline/g)).toHaveLength(5);
  });
});
