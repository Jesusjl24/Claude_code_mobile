// The classification request the builder copies into an AI assistant by hand,
// and the strict check of the answer they paste back. The app itself never
// calls an AI service.
import { APP_LABEL, type AccountViews, type Summary } from './summary';
import { VERDICTS, type Verdict } from './scoring';

export const MAX_REASON_WORDS = 14; // "under 15 words"

export interface ClassifiedEntry {
  account: string;
  verdict: Verdict;
  reason: string;
}

export function classificationRequest(summary: Pick<Summary, 'app' | 'goal'>, accounts: readonly AccountViews[]): string {
  const kind = summary.app === 'youtube' ? 'YouTube channels' : 'Instagram accounts';
  const lines = accounts.map((a) => JSON.stringify({ account: a.name, views: a.views }));
  return [
    `I am sorting ${kind} by whether they serve one person's goal.`,
    '',
    `The goal, in their words: ${JSON.stringify(summary.goal)}`,
    '',
    `Below are the ${accounts.length} ${APP_LABEL[summary.app]} ${summary.app === 'youtube' ? 'channels' : 'accounts'} they viewed most in the last 30 days, with the number of posts or videos viewed from each.`,
    '',
    'For each one, choose a bucket:',
    '- "on-goal": its content clearly serves the goal.',
    '- "off-goal": its content clearly pulls away from the goal.',
    '- "neutral": neither helps nor hurts the goal.',
    '- "unknown": the name alone is not enough to judge. Use this whenever you do not recognise the account or would be guessing from the name. Do not guess.',
    '',
    'Answer with JSON only: one array, with exactly one object for every account below, in the same order. No text before or after it.',
    'Each object has exactly these three fields:',
    '- "account": the name exactly as written below',
    '- "bucket": "on-goal", "neutral", "off-goal" or "unknown"',
    '- "reason": why, in under 15 words',
    '',
    'Example of the shape:',
    '[{"account": "example_account_01", "bucket": "unknown", "reason": "Name alone does not show what it posts."}]',
    '',
    'Accounts:',
    ...lines,
  ].join('\n');
}

export type ClassificationCheck = { ok: true; entries: ClassifiedEntry[] } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Removes one surrounding ``` code fence, which assistants often add around JSON. Nothing else is tolerated. */
function stripFence(text: string): string {
  const t = text.trim();
  const m = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(t);
  return m ? m[1]!.trim() : t;
}

function lineOf(text: string, needle: string): number | null {
  const at = text.indexOf(needle);
  if (at < 0) return null;
  return text.slice(0, at).split('\n').length;
}

/**
 * Strict check of the pasted answer against the accounts that were asked about.
 * Any problem at all rejects the whole paste; `errors` says which entries and lines failed.
 */
export function parseClassification(pasted: string, accounts: readonly AccountViews[]): ClassificationCheck {
  const text = stripFence(pasted);
  if (text === '') return { ok: false, errors: ['Nothing was pasted.'] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const pos = /position (\d+)/.exec(message);
    const line = pos ? text.slice(0, Number(pos[1])).split('\n').length : null;
    return {
      ok: false,
      errors: [`The pasted text is not valid JSON${line ? ` (problem near line ${line})` : ''}: ${message}. Paste only the JSON array from the assistant's answer.`],
    };
  }
  if (!Array.isArray(value)) return { ok: false, errors: ['The pasted JSON is not a list. It must be one array with an object per account.'] };

  const asked = new Set(accounts.map((a) => a.name));
  const seen = new Set<string>();
  const errors: string[] = [];
  const entries: ClassifiedEntry[] = [];

  value.forEach((item: unknown, i: number) => {
    const account = isRecord(item) && typeof item.account === 'string' ? item.account : null;
    const line = account !== null ? lineOf(text, JSON.stringify(account)) : null;
    const where = `Entry ${i + 1}${line ? ` (line ${line})` : ''}${account !== null ? `, ${JSON.stringify(account)}` : ''}`;
    const problems: string[] = [];
    if (!isRecord(item)) {
      errors.push(`${where}: is not an object.`);
      return;
    }
    for (const key of Object.keys(item)) if (!['account', 'bucket', 'reason'].includes(key)) problems.push(`has an unexpected field "${key}"`);
    if (account === null) problems.push('has no "account" text');
    else if (!asked.has(account)) problems.push('is not one of the accounts in the request');
    else if (seen.has(account)) problems.push('appears more than once');
    if (!VERDICTS.includes(item.bucket as Verdict)) problems.push(`has bucket ${JSON.stringify(item.bucket ?? null)}; it must be "on-goal", "neutral", "off-goal" or "unknown"`);
    if (typeof item.reason !== 'string' || item.reason.trim() === '') problems.push('has no "reason"');
    else if (wordCount(item.reason) > MAX_REASON_WORDS) problems.push(`has a reason of ${wordCount(item.reason)} words; it must be under 15`);
    if (account !== null) seen.add(account);
    if (problems.length) errors.push(`${where}: ${problems.join('; ')}.`);
    else entries.push({ account: account!, verdict: item.bucket as Verdict, reason: (item.reason as string).trim() });
  });

  for (const a of accounts) if (!seen.has(a.name)) errors.push(`Missing: no entry for ${JSON.stringify(a.name)}.`);
  return errors.length ? { ok: false, errors } : { ok: true, entries };
}
