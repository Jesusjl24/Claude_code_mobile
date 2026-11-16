// The builder's work on one tester: classifications, off-goal picks, mentors.
// Held in the open tab only; saved and reloaded as a file the builder keeps.
import type { ClassifiedEntry } from './classification';
import { checkMentor, type Mentor } from './mentors';
import { VERDICTS, reviewList, score, type Score, type Verdict } from './scoring';
import { validateSummary, type AccountViews, type Summary } from './summary';

export const REVIEW_FILE_NAME = 'algorithm-health-review.json';
export const REVIEW_KIND = 'algorithm-health-review';
export const OFF_GOAL_PICKS = 3;

export interface Classification {
  account: string;
  verdict: Verdict;
  reason: string;
  /** Who set the verdict: the pasted assistant answer, or the builder overriding it. */
  source: 'assistant' | 'builder';
}

export interface ReviewWork {
  kind: typeof REVIEW_KIND;
  schemaVersion: 1;
  savedAt: string;
  summary: Summary;
  classifications: Classification[];
  /** Off-goal accounts the builder chose for the report, or null to use the three most viewed. */
  offGoalPicks: string[] | null;
  offGoalConfirmed: boolean;
  mentors: Mentor[];
}

export function newReview(summary: Summary): ReviewWork {
  return { kind: REVIEW_KIND, schemaVersion: 1, savedAt: '', summary, classifications: [], offGoalPicks: null, offGoalConfirmed: false, mentors: [] };
}

export const verdictMap = (classifications: readonly Classification[]) => new Map(classifications.map((c) => [c.account, c] as const));

export function scoreOf(work: Pick<ReviewWork, 'summary' | 'classifications'>): Score {
  const map = verdictMap(work.classifications);
  return score(work.summary.accounts, (name) => map.get(name)?.verdict);
}

/** Applies a checked assistant answer, replacing all earlier classifications. Confirmation of the off-goal picks is reset. */
export function applyAssistantAnswer(work: ReviewWork, entries: readonly ClassifiedEntry[]): ReviewWork {
  return {
    ...work,
    classifications: entries.map((e) => ({ account: e.account, verdict: e.verdict, reason: e.reason, source: 'assistant' })),
    offGoalPicks: null,
    offGoalConfirmed: false,
  };
}

/** The builder overrides one account. `verdict` null removes the classification. */
export function overrideVerdict(work: ReviewWork, account: string, verdict: Verdict | null): ReviewWork {
  const rest = work.classifications.filter((c) => c.account !== account);
  const previous = work.classifications.find((c) => c.account === account);
  const classifications = verdict === null ? rest : [...rest, { account, verdict, reason: previous?.reason ?? '', source: 'builder' as const }];
  const next = { ...work, classifications, offGoalConfirmed: false };
  // Drop picks that are no longer off-goal.
  if (next.offGoalPicks) {
    const map = verdictMap(classifications);
    const kept = next.offGoalPicks.filter((p) => map.get(p)?.verdict === 'off-goal');
    next.offGoalPicks = kept.length ? kept : null;
  }
  return next;
}

/** Off-goal accounts, most viewed first. */
export function offGoalAccounts(work: Pick<ReviewWork, 'summary' | 'classifications'>): AccountViews[] {
  const map = verdictMap(work.classifications);
  return work.summary.accounts.filter((a) => map.get(a.name)?.verdict === 'off-goal').sort((a, b) => b.views - a.views);
}

/** The (up to) three off-goal accounts that go in the report: the builder's picks, or the most viewed. */
export function effectiveOffGoalPicks(work: Pick<ReviewWork, 'summary' | 'classifications' | 'offGoalPicks'>): AccountViews[] {
  const offGoal = offGoalAccounts(work);
  if (work.offGoalPicks) {
    const chosen = offGoal.filter((a) => work.offGoalPicks!.includes(a.name));
    if (chosen.length) return chosen.slice(0, OFF_GOAL_PICKS);
  }
  return offGoal.slice(0, OFF_GOAL_PICKS);
}

export function toReviewFile(work: ReviewWork, now: Date): string {
  return JSON.stringify({ ...work, savedAt: now.toISOString() }, null, 2) + '\n';
}

export type ReviewCheck = { ok: true; work: ReviewWork } | { ok: false; errors: string[] };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a saved work-in-progress file, re-checking everything in it including the mentor rules. */
export function parseReviewFile(text: string): ReviewCheck {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (!isRecord(v) || v.kind !== REVIEW_KIND) return { ok: false, errors: [`This is not a saved review file (${REVIEW_FILE_NAME}).`] };
  if (v.schemaVersion !== 1) return { ok: false, errors: ['This review file was made by a different version of the tool.'] };
  const s = validateSummary(v.summary);
  if (!s.ok) return { ok: false, errors: s.errors.map((e) => `summary: ${e}`) };
  const summary = s.summary;
  const errors: string[] = [];
  const names = new Set(summary.accounts.map((a) => a.name));

  const classifications: Classification[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(v.classifications)) errors.push('classifications must be a list.');
  else
    v.classifications.forEach((c: unknown, i: number) => {
      if (!isRecord(c) || typeof c.account !== 'string' || !VERDICTS.includes(c.verdict as Verdict) || typeof c.reason !== 'string' || (c.source !== 'assistant' && c.source !== 'builder')) {
        return void errors.push(`classifications[${i}] is not well-formed.`);
      }
      if (!names.has(c.account)) return void errors.push(`classifications[${i}]: "${c.account}" is not an account in the summary.`);
      if (seen.has(c.account)) return void errors.push(`classifications[${i}]: "${c.account}" appears twice.`);
      seen.add(c.account);
      classifications.push({ account: c.account, verdict: c.verdict as Verdict, reason: c.reason, source: c.source });
    });

  let offGoalPicks: string[] | null = null;
  if (v.offGoalPicks !== null) {
    if (!Array.isArray(v.offGoalPicks) || v.offGoalPicks.some((p) => typeof p !== 'string') || v.offGoalPicks.length > OFF_GOAL_PICKS) errors.push('offGoalPicks must be null or a list of up to three account names.');
    else offGoalPicks = v.offGoalPicks as string[];
  }
  if (typeof v.offGoalConfirmed !== 'boolean') errors.push('offGoalConfirmed must be true or false.');

  const mentors: Mentor[] = [];
  if (!Array.isArray(v.mentors)) errors.push('mentors must be a list.');
  else
    v.mentors.forEach((m: unknown, i: number) => {
      if (!isRecord(m)) return void errors.push(`mentors[${i}] is not well-formed.`);
      const check = checkMentor({ app: String(m.app), handle: String(m.handle ?? ''), name: String(m.name ?? ''), reason: String(m.reason ?? '') }, summary, mentors);
      if (check.ok) mentors.push(check.mentor);
      else errors.push(`mentors[${i}]: ${check.error}`);
    });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    work: { kind: REVIEW_KIND, schemaVersion: 1, savedAt: typeof v.savedAt === 'string' ? v.savedAt : '', summary, classifications, offGoalPicks, offGoalConfirmed: v.offGoalConfirmed as boolean, mentors },
  };
}

export { reviewList };
