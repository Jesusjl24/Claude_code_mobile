// /compare: the first and second summaries from one tester, plus the report
// data (the saved review), turned into the test's result: did the following
// list change in the way the report suggested?
import { mentorFollowKeys, normalizeName, type Mentor } from './mentors';
import { effectiveOffGoalPicks, verdictMap, type ReviewWork } from './review';
import { score, type Score, type Verdict } from './scoring';
import type { Summary } from './summary';

const DAY = 86_400_000;
export const MIN_GAP_DAYS = 7;
export const MAX_GAP_DAYS = 14;

export type ChangeTag = 'mentor' | 'off-goal-pick' | 'off-goal' | 'on-goal' | 'neutral' | 'unknown' | 'not-in-report';

export interface FollowChange {
  /** As written in the export where it was found. */
  name: string;
  tag: ChangeTag;
  /** True when the change is what the report suggested: following a mentor, or unfollowing an off-goal account. */
  matchesReport: boolean;
  /** True when the change goes against the report: unfollowing an on-goal account or a mentor. */
  againstReport: boolean;
}

export interface Comparison {
  newlyFollowed: FollowChange[];
  unfollowed: FollowChange[];
  matching: number;
  against: number;
  /** Mentors from the report, and whether each is followed in the second export. */
  mentors: { mentor: Mentor; followedNow: boolean }[];
  /** Off-goal picks from the report, and whether each is still followed in the second export. */
  picks: { name: string; followedBefore: boolean; followedNow: boolean }[];
  /** Both scored with the first scan's buckets. */
  before: Score;
  after: Score;
  /** Views of mentor accounts in the second scan (mentors are in no bucket, so this is outside the score). */
  mentorViewsAfter: number;
  gapDays: number;
  warnings: string[];
}

export type CompareCheck = { ok: true; comparison: Comparison } | { ok: false; errors: string[] };

export function compare(first: Summary, second: Summary, report: ReviewWork): CompareCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (first.app !== second.app) errors.push(`The two summaries are from different apps (${first.app} and ${second.app}).`);
  if (report.summary.app !== first.app) errors.push('The report data is for a different app from the summaries.');
  if (report.summary.createdAt !== first.createdAt || report.summary.goal !== first.goal) {
    errors.push('The report data was not made from this first summary (its date or goal differ). Load the summary the report was made from as the first one.');
  }
  if (Date.parse(second.createdAt) <= Date.parse(first.createdAt)) errors.push('The second summary is not newer than the first. Check which file is which.');
  if (errors.length) return { ok: false, errors };

  if (second.goal.trim() !== first.goal.trim()) warnings.push(`The goal in the second summary is worded differently: "${second.goal}". The first scan's goal and buckets are used.`);
  const gapDays = Math.round((Date.parse(second.createdAt) - Date.parse(first.createdAt)) / DAY);
  if (gapDays < MIN_GAP_DAYS || gapDays > MAX_GAP_DAYS) warnings.push(`The second summary was made ${gapDays} days after the first; the test asks for 7 to 14.`);
  if (second.following.length === 0 && first.following.length > 0) warnings.push('The second summary has an empty following list. Check the export included it before trusting the result.');

  const verdicts = verdictMap(report.classifications);
  const verdictByKey = new Map<string, Verdict>();
  for (const [name, c] of verdicts) verdictByKey.set(normalizeName(name), c.verdict);
  const pickKeys = new Set(effectiveOffGoalPicks(report).map((p) => normalizeName(p.name)));
  const mentorKeys = new Set(report.mentors.flatMap(mentorFollowKeys));

  const firstKeys = new Set(first.following.map(normalizeName));
  const secondKeys = new Set(second.following.map(normalizeName));

  const tagOf = (key: string): ChangeTag => {
    if (mentorKeys.has(key)) return 'mentor';
    if (pickKeys.has(key)) return 'off-goal-pick';
    const v = verdictByKey.get(key);
    return v ?? 'not-in-report';
  };

  const newlyFollowed: FollowChange[] = [];
  for (const name of second.following) {
    const key = normalizeName(name);
    if (firstKeys.has(key)) continue;
    const tag = tagOf(key);
    newlyFollowed.push({ name, tag, matchesReport: tag === 'mentor', againstReport: tag === 'off-goal-pick' || tag === 'off-goal' });
  }
  const unfollowed: FollowChange[] = [];
  for (const name of first.following) {
    const key = normalizeName(name);
    if (secondKeys.has(key)) continue;
    const tag = tagOf(key);
    unfollowed.push({ name, tag, matchesReport: tag === 'off-goal-pick' || tag === 'off-goal', againstReport: tag === 'on-goal' || tag === 'mentor' });
  }
  const order = (a: FollowChange, b: FollowChange) => Number(b.matchesReport) - Number(a.matchesReport) || a.name.localeCompare(b.name);
  newlyFollowed.sort(order);
  unfollowed.sort(order);

  const verdictOf = (name: string) => verdictByKey.get(normalizeName(name));
  const mentorViewsAfter = second.accounts.filter((a) => mentorKeys.has(normalizeName(a.name))).reduce((n, a) => n + a.views, 0);

  return {
    ok: true,
    comparison: {
      newlyFollowed,
      unfollowed,
      matching: newlyFollowed.filter((c) => c.matchesReport).length + unfollowed.filter((c) => c.matchesReport).length,
      against: newlyFollowed.filter((c) => c.againstReport).length + unfollowed.filter((c) => c.againstReport).length,
      mentors: report.mentors.map((m) => ({ mentor: m, followedNow: mentorFollowKeys(m).some((k) => secondKeys.has(k)) })),
      picks: effectiveOffGoalPicks(report).map((p) => ({ name: p.name, followedBefore: firstKeys.has(normalizeName(p.name)), followedNow: secondKeys.has(normalizeName(p.name)) })),
      before: score(first.accounts, verdictOf),
      after: score(second.accounts, verdictOf),
      mentorViewsAfter,
      gapDays,
      warnings,
    },
  };
}

export const TAG_LABEL: Record<ChangeTag, string> = {
  mentor: 'Mentor in the report',
  'off-goal-pick': 'Top off-goal pick in the report',
  'off-goal': 'Off-goal in the report',
  'on-goal': 'On-goal in the report',
  neutral: 'Neutral in the report',
  unknown: 'Unknown in the report',
  'not-in-report': 'Not in the report',
};
