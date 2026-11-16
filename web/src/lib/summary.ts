// The summary file: the only thing that ever leaves the tester's device.
// Field names come from SPEC.md. Nothing else may be written to the file.

export const SCHEMA_VERSION = 1;
export const SUMMARY_FILE_NAME = 'algorithm-health-summary.json';

export type AppId = 'instagram' | 'youtube';
export const APP_IDS: readonly AppId[] = ['instagram', 'youtube'];
export const APP_LABEL: Record<AppId, string> = { instagram: 'Instagram', youtube: 'YouTube' };

export interface AccountViews {
  /** Instagram handle or YouTube channel name, as written in the export. */
  name: string;
  /** View events for this account inside the range. */
  views: number;
}

export interface Summary {
  schemaVersion: typeof SCHEMA_VERSION;
  app: AppId;
  /** When the summary was made, ISO 8601. */
  createdAt: string;
  /** The goal in the tester's own words. */
  goal: string;
  /** First and last day (UTC, YYYY-MM-DD) of the view events counted. */
  rangeStart: string;
  rangeEnd: string;
  /** All view events in the range, attributed or not. */
  totalViewEvents: number;
  /** View events in the range with no account or channel named. */
  unattributedEvents: number;
  /** Most viewed first. */
  accounts: AccountViews[];
  /** Instagram handles followed, or YouTube channel names subscribed to. */
  following: string[];
}

export const SUMMARY_FIELDS = [
  'schemaVersion',
  'app',
  'createdAt',
  'goal',
  'rangeStart',
  'rangeEnd',
  'totalViewEvents',
  'unattributedEvents',
  'accounts',
  'following',
] as const satisfies readonly (keyof Summary)[];

export const ACCOUNT_FIELDS = ['name', 'views'] as const satisfies readonly (keyof AccountViews)[];

export const GOAL_MAX_LENGTH = 300;

export type SummaryCheck = { ok: true; summary: Summary } | { ok: false; errors: string[] };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Strict check: every field present and well-formed, and no field that is not in the spec. */
export function validateSummary(value: unknown): SummaryCheck {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['The file is not a JSON object.'] };

  const allowed = new Set<string>(SUMMARY_FIELDS);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`Unexpected field "${key}".`);
  for (const key of SUMMARY_FIELDS) if (!(key in value)) errors.push(`Missing field "${key}".`);
  if (errors.length) return { ok: false, errors };

  if (value.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}.`);
  if (!APP_IDS.includes(value.app as AppId)) errors.push('app must be "instagram" or "youtube".');
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) errors.push('createdAt must be a date and time.');
  if (typeof value.goal !== 'string' || value.goal.trim() === '') errors.push('goal must be non-empty text.');
  else if (value.goal.length > GOAL_MAX_LENGTH) errors.push(`goal must be at most ${GOAL_MAX_LENGTH} characters.`);
  for (const key of ['rangeStart', 'rangeEnd'] as const) {
    const v = value[key];
    if (typeof v !== 'string' || !DAY_RE.test(v) || Number.isNaN(Date.parse(v))) errors.push(`${key} must be a day written YYYY-MM-DD.`);
  }
  if (typeof value.rangeStart === 'string' && typeof value.rangeEnd === 'string' && value.rangeStart > value.rangeEnd) errors.push('rangeStart is after rangeEnd.');
  if (!isCount(value.totalViewEvents)) errors.push('totalViewEvents must be a whole number.');
  if (!isCount(value.unattributedEvents)) errors.push('unattributedEvents must be a whole number.');

  let accountTotal = 0;
  if (!Array.isArray(value.accounts)) errors.push('accounts must be a list.');
  else {
    const seen = new Set<string>();
    const accountAllowed = new Set<string>(ACCOUNT_FIELDS);
    value.accounts.forEach((a: unknown, i: number) => {
      if (!isRecord(a)) return void errors.push(`accounts[${i}] is not an object.`);
      for (const key of Object.keys(a)) if (!accountAllowed.has(key)) errors.push(`accounts[${i}] has unexpected field "${key}".`);
      if (typeof a.name !== 'string' || a.name === '') errors.push(`accounts[${i}].name must be non-empty text.`);
      else if (seen.has(a.name)) errors.push(`accounts[${i}].name "${a.name}" appears twice.`);
      else seen.add(a.name);
      if (!isCount(a.views) || a.views === 0) errors.push(`accounts[${i}].views must be a whole number above zero.`);
      else accountTotal += a.views;
    });
  }
  if (!Array.isArray(value.following)) errors.push('following must be a list.');
  else
    value.following.forEach((f: unknown, i: number) => {
      if (typeof f !== 'string' || f === '') errors.push(`following[${i}] must be non-empty text.`);
    });

  if (errors.length === 0 && accountTotal + (value.unattributedEvents as number) !== value.totalViewEvents) {
    errors.push('The account view counts plus unattributedEvents do not add up to totalViewEvents.');
  }
  return errors.length ? { ok: false, errors } : { ok: true, summary: value as unknown as Summary };
}

/**
 * Copies only the fields named in the spec, then checks the result. Anything
 * else on the input object is dropped, so nothing extra can reach the file.
 */
export function toSummaryFile(input: Summary): string {
  const clean: Summary = {
    schemaVersion: input.schemaVersion,
    app: input.app,
    createdAt: input.createdAt,
    goal: input.goal,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    totalViewEvents: input.totalViewEvents,
    unattributedEvents: input.unattributedEvents,
    accounts: input.accounts.map((a) => ({ name: a.name, views: a.views })),
    following: [...input.following],
  };
  const check = validateSummary(clean);
  if (!check.ok) throw new Error(`Refusing to write an invalid summary: ${check.errors.join(' ')}`);
  return JSON.stringify(clean, null, 2) + '\n';
}

/** Parses the text of a summary file. */
export function parseSummaryFile(text: string): SummaryCheck {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON. Is this the algorithm-health-summary.json file?'] };
  }
  return validateSummary(value);
}

export function attributedEvents(s: Pick<Summary, 'totalViewEvents' | 'unattributedEvents'>): number {
  return s.totalViewEvents - s.unattributedEvents;
}
