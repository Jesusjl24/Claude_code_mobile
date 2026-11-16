import { describe, expect, it } from 'vitest';
import { DECOY_MARKER, FIRST_SCAN_END, youtubeChannel } from '../scripts/make-fixtures.mjs';
import { youtubeAdapter, readSubscriptions, readWatchRecord } from '../src/adapters/youtube';
import { openZip } from '../src/lib/zip';
import { exportErrorFrom, fixtureZip, zipOf } from './helpers';

const DAY = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const entry = (time: string, channel?: string) =>
  JSON.stringify({ header: 'YouTube', title: 'Watched Example video', time, ...(channel ? { subtitles: [{ name: channel }] } : {}) });
const SUBS = 'Channel Id,Channel Url,Channel Title\nUC1,http://example.invalid/1,Example Channel A\n';
const scanOf = async (files: Record<string, string>) => youtubeAdapter.scan(await openZip(await zipOf(files)));

describe('YouTube adapter: fixtures', () => {
  it('normal: counts the last 30 days, unattributed entries and subscriptions', async () => {
    const zip = await fixtureZip('youtube-normal.zip');
    const r = await youtubeAdapter.scan(zip);
    expect(r.app).toBe('youtube');
    expect(r.rangeEnd).toBe(day(FIRST_SCAN_END));
    expect(r.rangeStart >= day(FIRST_SCAN_END - 30 * DAY)).toBe(true);
    // 1,500 events over 60 days: about half fall in the window.
    expect(r.totalViewEvents).toBeGreaterThan(600);
    expect(r.totalViewEvents).toBeLessThan(900);
    expect(r.totalViewEvents + r.info.eventsBeforeRange).toBe(1500);
    expect(r.unattributedEvents).toBeGreaterThan(0);
    expect(r.accounts.reduce((n, a) => n + a.views, 0) + r.unattributedEvents).toBe(r.totalViewEvents);
    expect(r.accounts[0]!.name).toBe(youtubeChannel(0));
    for (let i = 1; i < r.accounts.length; i++) expect(r.accounts[i - 1]!.views).toBeGreaterThanOrEqual(r.accounts[i]!.views);
    // The awkward channel name survives the streaming reader and the CSV reader.
    expect(r.accounts.map((a) => a.name)).toContain(youtubeChannel(6));
    expect(r.following).toHaveLength(25);
    expect(r.following).toContain(youtubeChannel(6));
    expect(r.info.skippedRecords).toBe(0);
  });

  it('normal: opens only the two files it names and nothing from the decoys', async () => {
    const zip = await fixtureZip('youtube-normal.zip');
    const r = await youtubeAdapter.scan(zip);
    expect(zip.opened.sort()).toEqual([
      'Takeout/YouTube and YouTube Music/history/watch-history.json',
      'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv',
    ]);
    expect(zip.names.some((n) => n.includes('search-history'))).toBe(true);
    expect(JSON.stringify(r)).not.toContain(DECOY_MARKER);
  });

  it('empty: says there is no watch history, with the file names', async () => {
    const e = await exportErrorFrom(youtubeAdapter.scan(await fixtureZip('youtube-empty.zip')));
    expect(e.code).toBe('no-view-events');
    expect(e.message).toMatch(/no watch history/);
    expect(e.filesFound).toContain('Takeout/YouTube and YouTube Music/history/watch-history.json');
  });

  it('html: tells the tester to request JSON', async () => {
    const zip = await fixtureZip('youtube-html.zip');
    const e = await exportErrorFrom(youtubeAdapter.scan(zip));
    expect(e.code).toBe('html-export');
    expect(e.message).toMatch(/JSON/);
    expect(e.filesFound).toContain('Takeout/YouTube and YouTube Music/history/watch-history.html');
    expect(zip.opened).toEqual([]);
  });

  it('unexpected names: fails loudly listing what it found, opening nothing', async () => {
    const zip = await fixtureZip('youtube-unexpected.zip');
    const e = await exportErrorFrom(youtubeAdapter.scan(zip));
    expect(e.code).toBe('files-not-found');
    expect(e.filesFound).toEqual(expect.arrayContaining(['Takeout/Example Video Service/verlauf/watched_videos.json', 'Takeout/Example Video Service/abos/abos.csv']));
    expect(zip.opened).toEqual([]);
  });

  it('large: 210,000 events', async () => {
    const r = await youtubeAdapter.scan(await fixtureZip('youtube-large.zip'));
    expect(r.totalViewEvents + r.info.eventsBeforeRange).toBe(210_000);
    expect(r.totalViewEvents).toBeGreaterThan(10_000);
    expect(r.following).toHaveLength(400);
  });

  it('instagram fixture: is not mistaken for a YouTube export', async () => {
    const e = await exportErrorFrom(youtubeAdapter.scan(await fixtureZip('instagram-normal.zip')));
    expect(e.code).toBe('files-not-found');
  });
});

describe('YouTube adapter: edge cases', () => {
  it('uses the whole range when the export covers less than 30 days', async () => {
    const r = await scanOf({
      'a/watch-history.json': `[${entry('2026-11-10T10:00:00Z', 'Example Channel A')},${entry('2026-11-03T10:00:00Z', 'Example Channel B')}]`,
      'b/subscriptions.csv': SUBS,
    });
    expect([r.rangeStart, r.rangeEnd, r.totalViewEvents, r.info.eventsBeforeRange]).toEqual(['2026-11-03', '2026-11-10', 2, 0]);
  });

  it('drops events exactly 30 days or more before the newest one', async () => {
    const r = await scanOf({
      'watch-history.json': `[${entry('2026-11-10T10:00:00Z', 'Example Channel A')},${entry('2026-10-11T10:00:01Z', 'Example Channel A')},${entry('2026-10-11T10:00:00Z', 'Example Channel B')},${entry('2025-01-01T00:00:00Z')}]`,
      'subscriptions.csv': SUBS,
    });
    expect(r.totalViewEvents).toBe(2);
    expect(r.accounts).toEqual([{ name: 'Example Channel A', views: 2 }]);
    expect(r.unattributedEvents).toBe(0);
    expect(r.info.eventsBeforeRange).toBe(2);
    expect(r.rangeStart).toBe('2026-10-11');
  });

  it('counts entries with no channel as unattributed, and copes when every entry is', async () => {
    const r = await scanOf({
      'watch-history.json': `[${entry('2026-11-10T10:00:00Z')},${JSON.stringify({ time: '2026-11-09T10:00:00Z', subtitles: [] })},${JSON.stringify({ time: '2026-11-09T10:00:00Z', subtitles: [{ name: '  ' }] })}]`,
      'subscriptions.csv': SUBS,
    });
    expect([r.totalViewEvents, r.unattributedEvents, r.accounts.length]).toEqual([3, 3, 0]);
    expect(r.info.notes.join(' ')).toMatch(/names a channel/);
  });

  it('reads a one-entry history', async () => {
    const r = await scanOf({ 'watch-history.json': `[${entry('2026-11-10T10:00:00Z', 'Example Channel A')}]`, 'subscriptions.csv': SUBS });
    expect(r.accounts).toEqual([{ name: 'Example Channel A', views: 1 }]);
    expect(r.following).toEqual(['Example Channel A']);
  });

  it('fails loudly when entries have no time field (format changed)', async () => {
    const e = await exportErrorFrom(scanOf({ 'watch-history.json': '[{"when":"2026-11-10","channel":"x"},{"when":"2026-11-09","channel":"y"}]', 'subscriptions.csv': SUBS }));
    expect(e.code).toBe('unexpected-format');
    expect(e.detail).toContain('when, channel');
  });

  it('tolerates a few unreadable entries but reports them', async () => {
    const good = Array.from({ length: 40 }, (_, i) => entry(`2026-11-${String(10 - (i % 5)).padStart(2, '0')}T10:00:00Z`, 'Example Channel A'));
    const r = await scanOf({ 'watch-history.json': `[${good.join(',')},{"time":"not a date"}]`, 'subscriptions.csv': SUBS });
    expect(r.totalViewEvents).toBe(40);
    expect(r.info.skippedRecords).toBe(1);
  });

  it('fails loudly on a truncated or non-JSON history file', async () => {
    const cut = await exportErrorFrom(scanOf({ 'watch-history.json': `[${entry('2026-11-10T10:00:00Z', 'x')},{"time":`, 'subscriptions.csv': SUBS }));
    expect(cut.code).toBe('unexpected-format');
    expect(cut.message).toMatch(/before its JSON is complete/);
    const html = await exportErrorFrom(scanOf({ 'watch-history.json': '<html>', 'subscriptions.csv': SUBS }));
    expect(html.message).toMatch(/HTML, not JSON/);
  });

  it('asks for subscriptions when only history is present, and refuses two history files', async () => {
    const one = `[${entry('2026-11-10T10:00:00Z', 'x')}]`;
    const noSubs = await exportErrorFrom(scanOf({ 'watch-history.json': one }));
    expect(noSubs.message).toMatch(/subscriptions/);
    const two = await exportErrorFrom(scanOf({ 'a/watch-history.json': one, 'b/watch-history.json': one, 'subscriptions.csv': SUBS }));
    expect(two.message).toMatch(/2 files named/);
  });

  it('fails loudly when subscriptions.csv has unexpected columns', async () => {
    const e = await exportErrorFrom(scanOf({ 'watch-history.json': `[${entry('2026-11-10T10:00:00Z', 'x')}]`, 'subscriptions.csv': 'Kanal-ID,Kanal-URL,Kanaltitel\n1,2,3\n' }));
    expect(e.code).toBe('unexpected-format');
    expect(e.detail).toContain('Kanaltitel');
  });

  it('rejects a file that is not a zip', async () => {
    await expect(openZip(new Blob(['this is not a zip']))).rejects.toThrow();
  });

  it('readWatchRecord and readSubscriptions handle odd input', () => {
    expect(readWatchRecord(null)).toBeNull();
    expect(readWatchRecord({ time: 5 })).toBeNull();
    expect(readWatchRecord({ time: '2026-11-10T10:00:00Z', subtitles: 'x' })).toEqual({ timeMs: Date.parse('2026-11-10T10:00:00Z'), channel: null });
    expect(readSubscriptions('Channel Id,Channel Url,Channel Title\n1,u,A\n2,u,A\n3,u,\n', 'f', [])).toEqual(['A']);
    expect(() => readSubscriptions('', 'f', [])).toThrow(/empty/);
  });
});
