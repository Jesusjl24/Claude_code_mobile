import { describe, expect, it } from 'vitest';
import { NOT_ENOUGH_TEXT, SCORE_LABEL, reviewList, score, sharePercent, type Verdict } from '../src/lib/scoring';

const acc = (name: string, views: number) => ({ name, views });
const from = (map: Record<string, Verdict>) => (name: string) => map[name];

describe('score', () => {
  it('goal match = on-goal / classified, rounded; coverage = classified / attributed', () => {
    const s = score([acc('a', 50), acc('b', 30), acc('c', 10), acc('d', 10)], from({ a: 'on-goal', b: 'off-goal', c: 'neutral' }));
    expect(s.views).toEqual({ 'on-goal': 50, neutral: 10, 'off-goal': 30 });
    expect([s.classified, s.unclassified, s.attributed]).toEqual([90, 10, 100]);
    expect(s.coveragePercent).toBe(90);
    expect(s.enough).toBe(true);
    expect(s.goalMatchPercent).toBe(56); // 50 / 90 = 55.6
  });

  it('unknown and unlisted accounts are left out, never counted as off-goal', () => {
    const withUnknown = score([acc('a', 60), acc('b', 20), acc('c', 20)], from({ a: 'on-goal', b: 'unknown' }));
    expect(withUnknown.views['off-goal']).toBe(0);
    expect(withUnknown.classified).toBe(60);
    expect(withUnknown.unclassified).toBe(40);
    expect(withUnknown.goalMatchPercent).toBe(100);
    // Marking the unknown one off-goal instead changes the score: proof they are treated differently.
    expect(score([acc('a', 60), acc('b', 20), acc('c', 20)], from({ a: 'on-goal', b: 'off-goal' })).goalMatchPercent).toBe(75);
  });

  it('under 60% coverage gives no number', () => {
    const s = score([acc('a', 59), acc('b', 41)], from({ a: 'on-goal' }));
    expect(s.coveragePercent).toBe(59);
    expect(s.enough).toBe(false);
    expect(s.goalMatchPercent).toBeNull();
    expect(NOT_ENOUGH_TEXT).toBe('Not enough classified to score');
  });

  it('exactly 60% coverage is enough; 59.9% is not and never displays as 60', () => {
    expect(score([acc('a', 60), acc('b', 40)], from({ a: 'neutral' })).goalMatchPercent).toBe(0);
    const s = score([acc('a', 599), acc('b', 401)], from({ a: 'on-goal' }));
    expect([s.enough, s.coveragePercent]).toEqual([false, 59]);
  });

  it('zero accounts', () => {
    const s = score([], () => 'on-goal');
    expect(s).toMatchObject({ classified: 0, attributed: 0, coverage: 0, coveragePercent: 0, enough: false, goalMatchPercent: null });
  });

  it('one account, in each state', () => {
    expect(score([acc('a', 7)], from({ a: 'on-goal' })).goalMatchPercent).toBe(100);
    expect(score([acc('a', 7)], from({ a: 'off-goal' })).goalMatchPercent).toBe(0);
    expect(score([acc('a', 7)], from({ a: 'neutral' })).goalMatchPercent).toBe(0);
    expect(score([acc('a', 7)], from({ a: 'unknown' })).goalMatchPercent).toBeNull();
    expect(score([acc('a', 7)], from({})).goalMatchPercent).toBeNull();
    expect(score([acc('a', 7)], from({ a: 'on-goal' })).coveragePercent).toBe(100);
  });

  it('nothing classified at all', () => {
    const s = score([acc('a', 5), acc('b', 5)], () => undefined);
    expect([s.enough, s.goalMatchPercent, s.coveragePercent]).toEqual([false, null, 0]);
  });

  it('rounds halves up and labels the number as posts viewed, not time', () => {
    expect(score([acc('a', 1), acc('b', 1)], from({ a: 'on-goal', b: 'off-goal' })).goalMatchPercent).toBe(50);
    expect(score([acc('a', 1), acc('b', 7)], from({ a: 'on-goal', b: 'off-goal' })).goalMatchPercent).toBe(13); // 12.5
    expect(SCORE_LABEL).toBe('share of posts you viewed');
    expect(SCORE_LABEL).not.toMatch(/time/);
  });
});

describe('sharePercent', () => {
  it('formats shares of attributed views', () => {
    expect(sharePercent(25, 100)).toBe('25');
    expect(sharePercent(1, 1000)).toBe('<1');
    expect(sharePercent(0, 100)).toBe('0');
    expect(sharePercent(5, 0)).toBe('0');
  });
});

describe('reviewList', () => {
  it('takes accounts until they cover at least 80% of views', () => {
    const list = reviewList([acc('d', 5), acc('a', 50), acc('c', 15), acc('b', 30)]);
    expect(list.map((a) => a.name)).toEqual(['a', 'b']);
    expect(reviewList([acc('a', 50), acc('b', 29), acc('c', 15), acc('d', 6)]).map((a) => a.name)).toEqual(['a', 'b', 'c']);
  });

  it('is capped at 150 accounts', () => {
    const many = Array.from({ length: 1000 }, (_, i) => acc(`example_${i}`, 1));
    expect(reviewList(many)).toHaveLength(150);
  });

  it('handles zero and one account', () => {
    expect(reviewList([])).toEqual([]);
    expect(reviewList([acc('a', 3)])).toEqual([acc('a', 3)]);
  });
});
