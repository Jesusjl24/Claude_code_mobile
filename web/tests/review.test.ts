import { describe, expect, it } from 'vitest';
import { classificationRequest, parseClassification } from '../src/lib/classification';
import { checkMentor, mentorUrl, type Mentor } from '../src/lib/mentors';
import { applyAssistantAnswer, effectiveOffGoalPicks, newReview, overrideVerdict, parseReviewFile, scoreOf, toReviewFile } from '../src/lib/review';
import type { Summary } from '../src/lib/summary';

const summary: Summary = {
  schemaVersion: 1,
  app: 'instagram',
  createdAt: '2026-11-10T12:00:00.000Z',
  goal: 'Learn to "cook" well',
  rangeStart: '2026-10-11',
  rangeEnd: '2026-11-10',
  totalViewEvents: 105,
  unattributedEvents: 5,
  accounts: [
    { name: 'example_cooking_account_01', views: 40 },
    { name: 'example_memes_account_02', views: 25 },
    { name: 'example_news_account_03', views: 15 },
    { name: 'example_memes_account_04', views: 10 },
    { name: 'example_gaming_account_05', views: 6 },
    { name: 'example_music_account_06', views: 4 },
  ],
  following: ['example_cooking_account_01', 'Example_Memes_Account_02'],
};
const listed = summary.accounts.slice(0, 4);
const answer = (over: Record<string, unknown>[] = []) =>
  JSON.stringify(
    [
      { account: 'example_cooking_account_01', bucket: 'on-goal', reason: 'Cooking tutorials.' },
      { account: 'example_memes_account_02', bucket: 'off-goal', reason: 'Meme content unrelated to cooking.' },
      { account: 'example_news_account_03', bucket: 'neutral', reason: 'General news.' },
      { account: 'example_memes_account_04', bucket: 'unknown', reason: 'Name alone is not enough.' },
      ...over,
    ],
    null,
    2,
  );

describe('classification request', () => {
  const text = classificationRequest(summary, listed);
  it('contains the goal and every listed account with its view count', () => {
    expect(text).toContain('"Learn to \\"cook\\" well"');
    for (const a of listed) expect(text).toContain(JSON.stringify({ account: a.name, views: a.views }));
    expect(text).not.toContain('example_gaming_account_05');
  });
  it('asks for JSON with the three buckets, a reason under 15 words, and unknown when the name is not enough', () => {
    expect(text).toMatch(/"on-goal", "neutral", "off-goal" or "unknown"/);
    expect(text).toMatch(/under 15 words/);
    expect(text).toMatch(/"unknown": the name alone is not enough to judge/);
    expect(text).toMatch(/JSON only/);
  });
  it('carries nothing but the goal, app, names and counts', () => {
    expect(text).not.toContain('2026');
    expect(text).not.toContain('following');
  });
});

describe('strict check of the pasted answer', () => {
  it('accepts a correct answer, with or without a code fence', () => {
    const plain = parseClassification(answer(), listed);
    expect(plain.ok).toBe(true);
    if (plain.ok) expect(plain.entries.map((e) => e.verdict)).toEqual(['on-goal', 'off-goal', 'neutral', 'unknown']);
    expect(parseClassification('```json\n' + answer() + '\n```', listed).ok).toBe(true);
  });

  const failing: [string, string, RegExp][] = [
    ['text around the JSON', 'Here you go:\n' + answer(), /not valid JSON/],
    ['not a list', '{"account":"x"}', /not a list/],
    ['empty paste', '   ', /Nothing was pasted/],
    ['an account that was not asked about', answer([{ account: 'example_other_99', bucket: 'neutral', reason: 'x' }]), /Entry 5 \(line \d+\), "example_other_99": is not one of the accounts/],
    ['a duplicate', answer([{ account: 'example_news_account_03', bucket: 'neutral', reason: 'x' }]), /Entry 5.*appears more than once/],
    ['a bad bucket', answer().replace('"neutral"', '"mostly-fine"'), /Entry 3 \(line 13\), "example_news_account_03": has bucket "mostly-fine"/],
    ['a long reason', answer().replace('General news.', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen'), /reason of 15 words/],
    ['a missing reason', answer().replace('"General news."', '""'), /has no "reason"/],
    ['an extra field', answer().replace('"reason": "General news."', '"reason": "General news.", "confidence": 0.9'), /unexpected field "confidence"/],
    ['a missing account', JSON.stringify(JSON.parse(answer()).slice(0, 3)), /Missing: no entry for "example_memes_account_04"/],
    ['an entry that is not an object', '["example_cooking_account_01"]', /Entry 1: is not an object/],
  ];
  for (const [name, text, expected] of failing) {
    it(`rejects ${name} and says where`, () => {
      const r = parseClassification(text, listed);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toMatch(expected);
    });
  }

  it('reports every failing entry, not just the first', () => {
    const r = parseClassification(answer().replace('"on-goal"', '"yes"').replace('"off-goal"', '"no"'), listed);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });

  it('a 14-word reason passes', () => {
    expect(parseClassification(answer().replace('General news.', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen'), listed).ok).toBe(true);
  });
});

describe('review work: overrides, off-goal picks, score', () => {
  const parsed = parseClassification(answer(), listed);
  if (!parsed.ok) throw new Error('fixture answer should parse');
  const work = applyAssistantAnswer(newReview(summary), parsed.entries);

  it('scores from the classifications; unknown and unlisted stay out', () => {
    const s = scoreOf(work);
    expect([s.classified, s.attributed, s.coveragePercent, s.goalMatchPercent]).toEqual([80, 100, 80, 50]);
  });

  it('an override changes the score, is marked as the builder\'s, and resets confirmation', () => {
    const confirmed = { ...work, offGoalConfirmed: true };
    const next = overrideVerdict(confirmed, 'example_memes_account_04', 'off-goal');
    expect(scoreOf(next).goalMatchPercent).toBe(44);
    expect(next.classifications.find((c) => c.account === 'example_memes_account_04')).toMatchObject({ source: 'builder', reason: 'Name alone is not enough.' });
    expect(next.offGoalConfirmed).toBe(false);
    expect(overrideVerdict(next, 'example_memes_account_04', null).classifications).toHaveLength(3);
  });

  it('off-goal picks default to the three most viewed and follow the builder\'s choice', () => {
    let w = work;
    for (const a of ['example_memes_account_04', 'example_gaming_account_05', 'example_music_account_06']) w = overrideVerdict(w, a, 'off-goal');
    expect(effectiveOffGoalPicks(w).map((a) => a.name)).toEqual(['example_memes_account_02', 'example_memes_account_04', 'example_gaming_account_05']);
    const custom = { ...w, offGoalPicks: ['example_music_account_06', 'example_memes_account_02'] };
    expect(effectiveOffGoalPicks(custom).map((a) => a.name)).toEqual(['example_memes_account_02', 'example_music_account_06']);
    // A pick that stops being off-goal is dropped.
    expect(overrideVerdict(custom, 'example_music_account_06', 'neutral').offGoalPicks).toEqual(['example_memes_account_02']);
    expect(effectiveOffGoalPicks(newReview(summary))).toEqual([]);
  });

  it('saves and reloads work in progress unchanged', () => {
    const mentor: Mentor = { app: 'instagram', handle: 'example_mentor_01', name: '', reason: 'Teaches knife skills.' };
    const full = { ...work, mentors: [mentor], offGoalPicks: ['example_memes_account_02'], offGoalConfirmed: true };
    const text = toReviewFile(full, new Date('2026-11-11T00:00:00Z'));
    const back = parseReviewFile(text);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.work).toEqual({ ...full, savedAt: '2026-11-11T00:00:00.000Z' });
  });

  it('refuses a damaged or foreign file, and one whose mentor breaks the rules', () => {
    expect(parseReviewFile('nope').ok).toBe(false);
    expect(parseReviewFile(JSON.stringify(summary)).ok).toBe(false);
    const base = JSON.parse(toReviewFile(work, new Date()));
    expect(parseReviewFile(JSON.stringify({ ...base, classifications: [{ account: 'someone_else', verdict: 'neutral', reason: '', source: 'builder' }] })).ok).toBe(false);
    expect(parseReviewFile(JSON.stringify({ ...base, summary: { ...summary, extra: 1 } })).ok).toBe(false);
    const followed = parseReviewFile(JSON.stringify({ ...base, mentors: [{ app: 'instagram', handle: 'example_cooking_account_01', name: '', reason: 'x' }] }));
    expect(followed.ok).toBe(false);
    if (!followed.ok) expect(followed.errors[0]).toMatch(/already follows/);
  });
});

describe('mentor rules', () => {
  const ok = (handle: string, s = summary, name = '', app: string = s.app) => checkMentor({ app, handle, name, reason: 'Good for the goal.' }, s, []);
  const yt: Summary = { ...summary, app: 'youtube', following: ['Example Cooking Channel 01'] };

  it('accepts a handle, an @handle and a profile link on the scanned app', () => {
    for (const h of ['example_mentor_01', '@example_mentor_01', 'https://www.instagram.com/example_mentor_01/', 'instagram.com/example_mentor_01']) {
      const r = ok(h);
      expect(r).toMatchObject({ ok: true, mentor: { app: 'instagram', handle: 'example_mentor_01', name: '' } });
    }
    expect(mentorUrl({ app: 'instagram', handle: 'example_mentor_01' })).toBe('https://www.instagram.com/example_mentor_01/');
    const y = ok('https://www.youtube.com/@example_mentor_01', yt, 'Example Mentor Channel 01');
    expect(y).toMatchObject({ ok: true, mentor: { app: 'youtube', handle: 'example_mentor_01', name: 'Example Mentor Channel 01' } });
    expect(mentorUrl({ app: 'youtube', handle: 'example_mentor_01' })).toBe('https://www.youtube.com/@example_mentor_01');
  });

  it('refuses a mentor the tester already follows (any letter case, with or without @)', () => {
    for (const h of ['example_cooking_account_01', '@EXAMPLE_COOKING_ACCOUNT_01', 'example_memes_account_02', 'https://instagram.com/example_cooking_account_01']) {
      const r = ok(h);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/already follows/);
    }
    const y = ok('@example_cooking_01', yt, 'example cooking channel 01');
    expect(y.ok).toBe(false);
    if (!y.ok) expect(y.error).toMatch(/already follows Example|already follows example/i);
  });

  it('refuses a mentor on a different app from the scan', () => {
    const viaApp = ok('example_mentor_01', summary, 'Example Mentor', 'youtube');
    expect(viaApp.ok).toBe(false);
    if (!viaApp.ok) expect(viaApp.error).toMatch(/on YouTube, but this tester scanned Instagram/);
    const viaLink = ok('https://www.youtube.com/@example_mentor_01');
    expect(viaLink.ok).toBe(false);
    if (!viaLink.ok) expect(viaLink.error).toMatch(/a YouTube link, but this tester scanned Instagram/);
    const elsewhere = ok('https://example.invalid/@example_mentor_01', yt, 'x');
    expect(elsewhere.ok).toBe(false);
    if (!elsewhere.ok) expect(elsewhere.error).toMatch(/example\.invalid.*scanned YouTube/);
    expect(ok('example_mentor_01', yt, 'Example Mentor', 'instagram').ok).toBe(false);
  });

  it('refuses bad handles, missing reasons, missing YouTube channel names and duplicates', () => {
    expect(ok('not a handle').ok).toBe(false);
    expect(ok('').ok).toBe(false);
    expect(ok('https://www.youtube.com/channel/UCEXAMPLE', yt, 'x').ok).toBe(false);
    expect(ok('@example_mentor_01', yt, '').ok).toBe(false);
    expect(checkMentor({ app: 'instagram', handle: 'example_mentor_01', name: '', reason: '  ' }, summary, []).ok).toBe(false);
    expect(checkMentor({ app: 'instagram', handle: 'example_mentor_01', name: '', reason: 'x'.repeat(161) }, summary, []).ok).toBe(false);
    const first = ok('example_mentor_01');
    if (!first.ok) throw new Error('should pass');
    const again = checkMentor({ app: 'instagram', handle: '@Example_Mentor_01', name: '', reason: 'x' }, summary, [first.mentor]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already in the mentor list/);
  });

  it('squashes a multi-line reason to one line', () => {
    const r = checkMentor({ app: 'instagram', handle: 'example_mentor_01', name: '', reason: 'line one\nline two' }, summary, []);
    expect(r).toMatchObject({ ok: true, mentor: { reason: 'line one line two' } });
  });
});
