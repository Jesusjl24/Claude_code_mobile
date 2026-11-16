// Scoring rules from SPEC.md, as pure functions.
//
//   Unit:        view events (the exports carry no watch time).
//   Goal match:  on-goal views / classified views, rounded to a whole percent.
//   Coverage:    classified views / all attributed views.
//   "unknown" and unlisted accounts are unclassified: left out of the score,
//   never counted as off-goal.
//   Coverage under 60%: no score, "Not enough classified to score".
import type { AccountViews } from './summary';

export type Bucket = 'on-goal' | 'neutral' | 'off-goal';
export type Verdict = Bucket | 'unknown';

export const BUCKETS: readonly Bucket[] = ['on-goal', 'neutral', 'off-goal'];
export const VERDICTS: readonly Verdict[] = ['on-goal', 'neutral', 'off-goal', 'unknown'];
export const BUCKET_LABEL: Record<Bucket, string> = { 'on-goal': 'On-goal', neutral: 'Neutral', 'off-goal': 'Off-goal' };

export const MIN_COVERAGE = 0.6;
export const NOT_ENOUGH_TEXT = 'Not enough classified to score';
export const SCORE_LABEL = 'share of posts you viewed';

export const REVIEW_SHARE = 0.8;
export const REVIEW_CAP = 150;

export const isBucket = (v: unknown): v is Bucket => v === 'on-goal' || v === 'neutral' || v === 'off-goal';

export interface Score {
  /** View events per bucket. */
  views: Record<Bucket, number>;
  /** on-goal + neutral + off-goal view events. */
  classified: number;
  /** Attributed view events that are unknown or unlisted. */
  unclassified: number;
  /** All view events that name an account. */
  attributed: number;
  /** classified / attributed, 0 to 1 (0 when there are no attributed views). */
  coverage: number;
  /** Coverage as a whole percent, rounded down so 59.9% never shows as 60%. */
  coveragePercent: number;
  /** False when coverage is under 60% (or nothing is classified): show NOT_ENOUGH_TEXT, not a number. */
  enough: boolean;
  /** Whole percent, or null when `enough` is false. */
  goalMatchPercent: number | null;
}

/** `verdictOf` returns undefined for an account that has not been classified. */
export function score(accounts: readonly AccountViews[], verdictOf: (name: string) => Verdict | undefined): Score {
  const views: Record<Bucket, number> = { 'on-goal': 0, neutral: 0, 'off-goal': 0 };
  let attributed = 0;
  for (const a of accounts) {
    attributed += a.views;
    const v = verdictOf(a.name);
    if (isBucket(v)) views[v] += a.views;
  }
  const classified = views['on-goal'] + views.neutral + views['off-goal'];
  const coverage = attributed > 0 ? classified / attributed : 0;
  const enough = classified > 0 && coverage >= MIN_COVERAGE;
  return {
    views,
    classified,
    unclassified: attributed - classified,
    attributed,
    coverage,
    coveragePercent: Math.floor(coverage * 100),
    enough,
    goalMatchPercent: enough ? Math.round((views['on-goal'] / classified) * 100) : null,
  };
}

/** Share of all attributed views, as a whole percent. Under 1% (but not zero) reads "<1". */
export function sharePercent(views: number, attributed: number): string {
  if (attributed <= 0 || views <= 0) return '0';
  const p = (views / attributed) * 100;
  return p < 1 ? '<1' : String(Math.round(p));
}

/**
 * The accounts the builder classifies: most viewed first, taking accounts until
 * they cover at least 80% of attributed views, and never more than 150.
 */
export function reviewList(accounts: readonly AccountViews[]): AccountViews[] {
  const sorted = [...accounts].sort((a, b) => b.views - a.views || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const attributed = sorted.reduce((n, a) => n + a.views, 0);
  const out: AccountViews[] = [];
  let covered = 0;
  for (const a of sorted) {
    if (out.length >= REVIEW_CAP || covered >= attributed * REVIEW_SHARE) break;
    out.push(a);
    covered += a.views;
  }
  return out;
}
