import { describe, expect, it } from 'vitest';
import { compare } from '../src/lib/compare';
import { applyAssistantAnswer, newReview, type ReviewWork } from '../src/lib/review';
import { buildSummary, scanExport } from '../src/lib/scan';
import type { Summary } from '../src/lib/summary';
import type { Verdict } from '../src/lib/scoring';
import { fixtureBlob } from './helpers';

const first: Summary = {
  schemaVersion: 1,
  app: 'instagram',
  createdAt: '2026-11-10T12:00:00.000Z',
  goal: 'Learn to code',
  rangeStart: '2026-10-11',
  rangeEnd: '2026-11-10',
  totalViewEvents: 100,
  unattributedEvents: 0,
  accounts: [
    { name: 'example_coding_01', views: 40 },
    { name: 'example_memes_02', views: 30 },
    { name: 'example_memes_03', views: 20 },
    { name: 'example_news_04', views: 10 },
  ],
  following: ['example_coding_01', 'example_memes_02', 'Example_Memes_03', 'example_news_04', 'example_friend_05'],
};
const second: Summary = {
  ...first,
  createdAt: '2026-11-20T12:00:00.000Z',
  rangeStart: '2026-10-21',
  rangeEnd: '2026-11-20',
  totalViewEvents: 100,
  accounts: [
    { name: 'example_coding_01', views: 50 },
    { name: 'example_mentor_01', views: 20 },
    { name: 'example_memes_02', views: 10 },
    { name: 'example_new_06', views: 20 },
  ],
  following: ['example_coding_01', 'example_memes_03', 'example_friend_05', '@Example_Mentor_01', 'example_new_06'],
};
const verdicts: Record<string, Verdict> = { example_coding_01: 'on-goal', example_memes_02: 'off-goal', example_memes_03: 'off-goal', example_news_04: 'neutral' };
function report(over: Partial<ReviewWork> = {}): ReviewWork {
  const w = applyAssistantAnswer(newReview(first), Object.entries(verdicts).map(([account, verdict]) => ({ account, verdict, reason: 'x' })));
  return { ...w, offGoalConfirmed: true, offGoalPicks: ['example_memes_02'], mentors: [{ app: 'instagram', handle: 'example_mentor_01', name: '', reason: 'x' }, { app: 'instagram', handle: 'example_mentor_02', name: '', reason: 'x' }], ...over };
}

describe('compare', () => {
  const r = compare(first, second, report());
  if (!r.ok) throw new Error(r.errors.join(' '));
  const c = r.comparison;

  it('lists newly followed and unfollowed accounts, ignoring case and @', () => {
    expect(c.newlyFollowed.map((x) => [x.name, x.tag])).toEqual([
      ['@Example_Mentor_01', 'mentor'],
      ['example_new_06', 'not-in-report'],
    ]);
    expect(c.unfollowed.map((x) => [x.name, x.tag])).toEqual([
      ['example_memes_02', 'off-goal-pick'],
      ['example_news_04', 'neutral'],
    ]);
  });

  it('counts changes that match the report and ones that go against it', () => {
    expect(c.matching).toBe(2);
    expect(c.against).toBe(0);
    const unfollowedOnGoal = compare(first, { ...second, following: second.following.filter((f) => f !== 'example_coding_01') }, report());
    if (!unfollowedOnGoal.ok) throw new Error();
    expect(unfollowedOnGoal.comparison.against).toBe(1);
    // An off-goal account that was not a pick still counts as matching when unfollowed.
    const plainOffGoal = compare(first, { ...second, following: second.following.filter((f) => f !== 'example_memes_03') }, report());
    if (!plainOffGoal.ok) throw new Error();
    expect(plainOffGoal.comparison.unfollowed.find((x) => x.name === 'Example_Memes_03')).toMatchObject({ tag: 'off-goal', matchesReport: true });
  });

  it('reports each mentor and pick', () => {
    expect(c.mentors.map((m) => [m.mentor.handle, m.followedNow])).toEqual([
      ['example_mentor_01', true],
      ['example_mentor_02', false],
    ]);
    expect(c.picks).toEqual([{ name: 'example_memes_02', followedBefore: true, followedNow: false }]);
  });

  it('scores before and after with the first scan\'s buckets only', () => {
    // Before: on 40, off 50, neutral 10 of 100 -> 40%.
    expect([c.before.goalMatchPercent, c.before.coveragePercent]).toEqual([40, 100]);
    // After: on 50, off 10; the mentor and the new account are unclassified -> coverage 60%, 83%.
    expect([c.after.goalMatchPercent, c.after.coveragePercent]).toEqual([83, 60]);
    expect(c.mentorViewsAfter).toBe(20);
    expect(c.gapDays).toBe(10);
    expect(c.warnings).toEqual([]);
  });

  it('refuses mismatched files', () => {
    const bad = (a: Summary, b: Summary, w: ReviewWork) => {
      const x = compare(a, b, w);
      return x.ok ? [] : x.errors;
    };
    expect(bad(first, { ...second, app: 'youtube' }, report())[0]).toMatch(/different apps/);
    expect(bad(second, first, report()).join(' ')).toMatch(/not made from this first summary/);
    expect(bad(first, { ...second, createdAt: first.createdAt }, report()).join(' ')).toMatch(/not newer/);
    expect(bad(first, second, report({ summary: { ...first, goal: 'Other' } })).join(' ')).toMatch(/not made from this first summary/);
  });

  it('warns about a gap outside 7 to 14 days, a changed goal, or an empty following list', () => {
    const x = compare(first, { ...second, createdAt: '2026-11-12T12:00:00.000Z', goal: 'Learn to code faster', following: [] }, report());
    if (!x.ok) throw new Error();
    expect(x.comparison.warnings.join(' ')).toMatch(/2 days after/);
    expect(x.comparison.warnings.join(' ')).toMatch(/worded differently/);
    expect(x.comparison.warnings.join(' ')).toMatch(/empty following list/);
  });

  it('YouTube mentors match by channel name', () => {
    const yFirst = { ...first, app: 'youtube' as const, following: ['Example Coding Channel 01'] };
    const ySecond = { ...second, app: 'youtube' as const, following: ['Example Coding Channel 01', 'Example Mentor Channel 01'] };
    const w = report({ summary: yFirst, mentors: [{ app: 'youtube', handle: 'example_mentor_01', name: 'Example Mentor Channel 01', reason: 'x' }] });
    const x = compare(yFirst, ySecond, w);
    if (!x.ok) throw new Error(x.errors.join(' '));
    expect(x.comparison.newlyFollowed).toEqual([{ name: 'Example Mentor Channel 01', tag: 'mentor', matchesReport: true, againstReport: false }]);
  });
});

describe('compare with the fixtures', () => {
  for (const [app, mentorKey] of [['instagram', 'example_mentor_01'], ['youtube', 'Example Mentor Channel 01']] as const) {
    it(`${app}: the second export shows the made-up tester followed a mentor and dropped the off-goal picks`, async () => {
      const a = buildSummary(await scanExport(app, await fixtureBlob(`${app}-normal.zip`)), 'Get better at writing code', new Date('2026-11-10T12:00:00Z'));
      const b = buildSummary(await scanExport(app, await fixtureBlob(`${app}-normal-second.zip`)), 'Get better at writing code', new Date('2026-11-20T12:00:00Z'));
      const topicVerdict = (name: string): Verdict => (/coding|study/i.test(name) ? 'on-goal' : /memes|gaming/i.test(name) ? 'off-goal' : /news/i.test(name) ? 'unknown' : 'neutral');
      const w = applyAssistantAnswer(newReview(a), a.accounts.slice(0, 20).map((x) => ({ account: x.name, verdict: topicVerdict(x.name), reason: 'x' })));
      const mentors =
        app === 'instagram'
          ? [{ app, handle: 'example_mentor_01', name: '', reason: 'x' }]
          : [{ app, handle: 'example_mentor_01', name: 'Example Mentor Channel 01', reason: 'x' }];
      const x = compare(a, b, { ...w, offGoalConfirmed: true, mentors });
      if (!x.ok) throw new Error(x.errors.join(' '));
      const c = x.comparison;
      expect(c.newlyFollowed.find((f) => f.name === mentorKey)?.tag).toBe('mentor');
      expect(c.unfollowed).toHaveLength(3);
      expect(c.unfollowed.every((f) => f.matchesReport)).toBe(true);
      expect(c.picks.every((p) => p.followedBefore && !p.followedNow)).toBe(true);
      expect(c.matching).toBe(4);
      expect(c.before.goalMatchPercent).not.toBeNull();
    });
  }
});
