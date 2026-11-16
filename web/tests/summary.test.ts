import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_DIR } from '../scripts/make-fixtures.mjs';
import { SUMMARY_FIELDS, parseSummaryFile, toSummaryFile, validateSummary, type Summary } from '../src/lib/summary';

export const good: Summary = {
  schemaVersion: 1,
  app: 'youtube',
  createdAt: '2026-11-10T12:00:00.000Z',
  goal: 'Learn to code',
  rangeStart: '2026-10-11',
  rangeEnd: '2026-11-10',
  totalViewEvents: 10,
  unattributedEvents: 1,
  accounts: [
    { name: 'Example Coding Channel 01', views: 6 },
    { name: 'Example Memes Channel 03', views: 3 },
  ],
  following: ['Example Coding Channel 01'],
};

describe('summary validator', () => {
  it('accepts a well-formed summary', () => {
    expect(validateSummary(good)).toEqual({ ok: true, summary: good });
  });

  it('rejects any field that is not in the spec', () => {
    const r = validateSummary({ ...good, searches: ['x'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('Unexpected field "searches"');
  });

  it('rejects extra fields inside an account', () => {
    const r = validateSummary({ ...good, accounts: [{ name: 'a', views: 9, lastSeen: 'x' }] });
    expect(r.ok).toBe(false);
  });

  it('rejects missing fields, bad counts and totals that do not add up', () => {
    const { goal: _goal, ...noGoal } = good;
    expect(validateSummary(noGoal).ok).toBe(false);
    expect(validateSummary({ ...good, totalViewEvents: 11 }).ok).toBe(false);
    expect(validateSummary({ ...good, unattributedEvents: -1 }).ok).toBe(false);
    expect(validateSummary({ ...good, app: 'tiktok' }).ok).toBe(false);
    expect(validateSummary({ ...good, rangeStart: '2026-11-11' }).ok).toBe(false);
    expect(validateSummary({ ...good, accounts: [good.accounts[0], good.accounts[0]] }).ok).toBe(false);
    expect(validateSummary([]).ok).toBe(false);
    expect(validateSummary(null).ok).toBe(false);
  });

  it('writes only the allowed fields, even when handed an object with more', () => {
    const dirty = { ...good, rawEvents: [1, 2, 3], accounts: good.accounts.map((a) => ({ ...a, url: 'x' })) } as unknown as Summary;
    const written = JSON.parse(toSummaryFile(dirty));
    expect(Object.keys(written).sort()).toEqual([...SUMMARY_FIELDS].sort());
    for (const a of written.accounts) expect(Object.keys(a).sort()).toEqual(['name', 'views']);
    expect(parseSummaryFile(toSummaryFile(dirty)).ok).toBe(true);
  });

  it('refuses to write an invalid summary', () => {
    expect(() => toSummaryFile({ ...good, goal: '' })).toThrow(/invalid summary/);
  });

  it('reports text that is not JSON', () => {
    expect(parseSummaryFile('<html>').ok).toBe(false);
  });
});

describe('fixtures', () => {
  const kinds = ['normal', 'normal-second', 'empty', 'html', 'unexpected', 'large'];
  for (const app of ['youtube', 'instagram'])
    for (const kind of kinds)
      it(`${app}-${kind}.zip exists`, () => {
        const p = join(FIXTURE_DIR, `${app}-${kind}.zip`);
        expect(existsSync(p)).toBe(true);
        expect(statSync(p).size).toBeGreaterThan(100);
      });
});
