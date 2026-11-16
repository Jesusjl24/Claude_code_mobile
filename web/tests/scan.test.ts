import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DECOY_MARKER } from '../scripts/make-fixtures.mjs';
import { consentParagraphs } from '../src/lib/consent';
import { buildSummary, scanExport } from '../src/lib/scan';
import { SUMMARY_FIELDS, parseSummaryFile, toSummaryFile } from '../src/lib/summary';
import { exportErrorFrom, fixtureBlob } from './helpers';

/** Replaces every way a page can talk to the network with a trap that records the attempt and throws. */
function trapNetwork() {
  const attempts: string[] = [];
  const trap = (what: string) =>
    function (this: unknown, ...args: unknown[]) {
      attempts.push(`${what}(${String(args[0] ?? '')})`);
      throw new Error(`Network use during a scan: ${what}`);
    };
  vi.stubGlobal('fetch', trap('fetch'));
  vi.stubGlobal('XMLHttpRequest', trap('XMLHttpRequest'));
  vi.stubGlobal('WebSocket', trap('WebSocket'));
  vi.stubGlobal('EventSource', trap('EventSource'));
  vi.stubGlobal('Worker', trap('Worker'));
  vi.stubGlobal('navigator', { sendBeacon: trap('sendBeacon') });
  return attempts;
}

describe('a scan makes no network request', () => {
  let attempts: string[];
  beforeEach(() => {
    attempts = trapNetwork();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the trap itself works (so the tests below can fail)', () => {
    expect(() => fetch('https://example.invalid/upload')).toThrow(/Network use/);
    expect(() => new XMLHttpRequest()).toThrow(/Network use/);
    expect(attempts).toHaveLength(2);
  });

  for (const [app, fixture] of [['youtube', 'youtube-normal.zip'], ['instagram', 'instagram-normal.zip'], ['youtube', 'youtube-large.zip'], ['instagram', 'instagram-large.zip']] as const) {
    it(`${fixture}: scan, build and serialise the summary with every network API trapped`, async () => {
      const result = await scanExport(app, await fixtureBlob(fixture));
      const text = toSummaryFile(buildSummary(result, 'Learn to cook', new Date('2026-11-10T12:00:00Z')));
      expect(parseSummaryFile(text).ok).toBe(true);
      expect(attempts).toEqual([]);
    });
  }

  for (const fixture of ['youtube-html.zip', 'youtube-unexpected.zip', 'youtube-empty.zip']) {
    it(`${fixture}: a failed scan makes no request either`, async () => {
      await exportErrorFrom(scanExport('youtube', await fixtureBlob(fixture)));
      expect(attempts).toEqual([]);
    });
  }
});

describe('the saved file holds only the allowed fields', () => {
  for (const [app, fixture] of [['youtube', 'youtube-normal.zip'], ['instagram', 'instagram-normal.zip']] as const) {
    it(`${fixture}`, async () => {
      const result = await scanExport(app, await fixtureBlob(fixture));
      const text = toSummaryFile(buildSummary(result, '  Learn to cook  ', new Date('2026-11-10T12:00:00Z')));
      const file = JSON.parse(text);
      expect(Object.keys(file).sort()).toEqual([...SUMMARY_FIELDS].sort());
      for (const account of file.accounts) expect(Object.keys(account).sort()).toEqual(['name', 'views']);
      for (const f of file.following) expect(typeof f).toBe('string');
      expect(file.goal).toBe('Learn to cook');
      expect(file.app).toBe(app);
      expect(file.createdAt).toBe('2026-11-10T12:00:00.000Z');
      // Nothing from the scan's on-device notes or the decoy files gets in.
      expect(text).not.toContain('filesOpened');
      expect(text).not.toContain('.json');
      expect(text).not.toContain(DECOY_MARKER);
      // No timestamps of individual views: the only dates are createdAt and the two range days.
      expect(text.match(/\d{4}-\d{2}-\d{2}/g)).toHaveLength(3);
    });
  }
});

describe('scan errors meant for the tester', () => {
  it('a file that is not a zip', async () => {
    const e = await exportErrorFrom(scanExport('instagram', new Blob(['{"not":"a zip"}'])));
    expect(e.code).toBe('not-a-zip');
    expect(e.message).toMatch(/without unzipping/);
  });

  it('the other app\'s export gets a "wrong app" hint, with file names', async () => {
    const a = await exportErrorFrom(scanExport('youtube', await fixtureBlob('instagram-normal.zip')));
    expect(a.message).toMatch(/looks like an Instagram export, but you picked YouTube/);
    expect(a.filesFound.length).toBeGreaterThan(3);
    const b = await exportErrorFrom(scanExport('instagram', await fixtureBlob('youtube-html.zip')));
    expect(b.message).toMatch(/looks like a YouTube export/);
  });

  it('every failing fixture gives a message and the file names found', async () => {
    for (const app of ['youtube', 'instagram'] as const)
      for (const kind of ['empty', 'html', 'unexpected']) {
        const e = await exportErrorFrom(scanExport(app, await fixtureBlob(`${app}-${kind}.zip`)));
        expect(e.message.length).toBeGreaterThan(40);
        expect(e.filesFound.length).toBeGreaterThan(0);
      }
  });
});

describe('consent wording', () => {
  it('matches SPEC.md word for word, with the assistant name filled in', () => {
    const spec = readFileSync(join(__dirname, '..', '..', 'SPEC.md'), 'utf8').replace(/\n> ?/g, ' ').replace(/\s+/g, ' ');
    for (const p of consentParagraphs('[AI assistant]')) {
      expect(spec).toContain(`**${p.heading}** ${p.body}`);
    }
    expect(consentParagraphs('Example Assistant')[2]!.body).toContain('into Example Assistant, run by a company overseas');
  });
});

describe('source code guards', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(__dirname, '..', 'src'));

  it('no network API and no browser storage is used anywhere in src/', () => {
    const banned = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open|serviceWorker/;
    for (const f of files) {
      const hit = readFileSync(f, 'utf8').split('\n').find((line) => banned.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*'));
      expect(hit, `${f}: ${hit}`).toBeUndefined();
    }
  });
});
