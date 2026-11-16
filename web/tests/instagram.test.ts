import { describe, expect, it } from 'vitest';
import { DECOY_MARKER, FIRST_SCAN_END, instagramHandle } from '../scripts/make-fixtures.mjs';
import { instagramAdapter, readFollowingRecord, readViewRecord } from '../src/adapters/instagram';
import { openZip } from '../src/lib/zip';
import { exportErrorFrom, fixtureZip, zipOf } from './helpers';

const DAY = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const T = Date.UTC(2026, 10, 10, 10) / 1000;
const view = (seconds: number, author?: string) =>
  JSON.stringify({ title: '', string_map_data: { ...(author ? { Author: { value: author } } : {}), Time: { timestamp: seconds } } });
const posts = (...records: string[]) => `{"impressions_history_posts_seen":[${records.join(',')}]}`;
const following = (...handles: string[]) => JSON.stringify({ relationships_following: handles.map((h) => ({ title: '', string_list_data: [{ value: h }] })) });
const scanOf = async (files: Record<string, string>) => instagramAdapter.scan(await openZip(await zipOf(files)));

describe('Instagram adapter: fixtures', () => {
  it('normal: merges posts and videos, 30-day window, following list in both shapes', async () => {
    const r = await instagramAdapter.scan(await fixtureZip('instagram-normal.zip'));
    expect(r.app).toBe('instagram');
    expect(r.rangeEnd).toBe(day(FIRST_SCAN_END));
    expect(r.rangeStart >= day(FIRST_SCAN_END - 30 * DAY)).toBe(true);
    expect(r.totalViewEvents + r.info.eventsBeforeRange).toBe(1600);
    expect(r.totalViewEvents).toBeGreaterThan(650);
    expect(r.totalViewEvents).toBeLessThan(950);
    expect(r.unattributedEvents).toBeGreaterThan(0);
    expect(r.accounts.reduce((n, a) => n + a.views, 0) + r.unattributedEvents).toBe(r.totalViewEvents);
    expect(r.accounts[0]!.name).toBe(instagramHandle(0));
    expect(r.following).toEqual(Array.from({ length: 30 }, (_, i) => instagramHandle(i)));
    expect(r.info.skippedRecords).toBe(0);
    expect(r.info.notes).toEqual([]);
  });

  it('normal: opens only its three files; messages, searches, contacts and media stay closed', async () => {
    const zip = await fixtureZip('instagram-normal.zip');
    const r = await instagramAdapter.scan(zip);
    expect(zip.opened.sort()).toEqual([
      'ads_information/ads_and_topics/posts_viewed.json',
      'ads_information/ads_and_topics/videos_watched.json',
      'connections/followers_and_following/following.json',
    ]);
    for (const part of ['messages', 'recent_searches', 'contacts', 'media/', 'followers_1', 'following_hashtags']) {
      expect(zip.names.some((n) => n.includes(part))).toBe(true);
      expect(zip.opened.some((n) => n.includes(part))).toBe(false);
    }
    expect(JSON.stringify(r)).not.toContain(DECOY_MARKER);
  });

  it('empty: says there are no views, with the file names', async () => {
    const e = await exportErrorFrom(instagramAdapter.scan(await fixtureZip('instagram-empty.zip')));
    expect(e.code).toBe('no-view-events');
    expect(e.filesFound).toContain('ads_information/ads_and_topics/posts_viewed.json');
  });

  it('html: tells the tester to request JSON, opening nothing', async () => {
    const zip = await fixtureZip('instagram-html.zip');
    const e = await exportErrorFrom(instagramAdapter.scan(zip));
    expect(e.code).toBe('html-export');
    expect(e.message).toMatch(/choose "JSON"/);
    expect(e.filesFound).toContain('ads_information/ads_and_topics/posts_viewed.html');
    expect(zip.opened).toEqual([]);
  });

  it('unexpected names: fails loudly listing what it found', async () => {
    const zip = await fixtureZip('instagram-unexpected.zip');
    const e = await exportErrorFrom(instagramAdapter.scan(zip));
    expect(e.code).toBe('files-not-found');
    expect(e.filesFound).toEqual(expect.arrayContaining(['activity/seen_things.json', 'people/people_i_follow.json', 'readme.txt']));
    expect(zip.opened).toEqual([]);
  });

  it('large: 210,000 events', async () => {
    const r = await instagramAdapter.scan(await fixtureZip('instagram-large.zip'));
    expect(r.totalViewEvents + r.info.eventsBeforeRange).toBe(210_000);
    expect(r.following).toHaveLength(600);
  });

  it('youtube fixture: is not mistaken for an Instagram export', async () => {
    const e = await exportErrorFrom(instagramAdapter.scan(await fixtureZip('youtube-normal.zip')));
    expect(e.code).toBe('files-not-found');
  });
});

describe('Instagram adapter: edge cases', () => {
  it('works with only one of the two view files and says so', async () => {
    const r = await scanOf({ 'x/posts_viewed.json': posts(view(T, 'example_account_01')), 'y/following.json': following('example_account_02') });
    expect(r.accounts).toEqual([{ name: 'example_account_01', views: 1 }]);
    expect(r.following).toEqual(['example_account_02']);
    expect(r.info.notes.join(' ')).toMatch(/videos_watched\.json/);
  });

  it('uses the whole range under 30 days and drops older events otherwise', async () => {
    const short = await scanOf({ 'posts_viewed.json': posts(view(T, 'a_example'), view(T - 5 * 86400, 'b_example')), 'following.json': following() });
    expect([short.rangeStart, short.rangeEnd, short.totalViewEvents]).toEqual(['2026-11-05', '2026-11-10', 2]);
    const long = await scanOf({
      'posts_viewed.json': posts(view(T, 'a_example'), view(T - 29 * 86400, 'a_example')),
      'videos_watched.json': `{"impressions_history_videos_watched":[${view(T - 30 * 86400, 'b_example')},${view(T - 300 * 86400)}]}`,
      'following.json': following(),
    });
    expect(long.accounts).toEqual([{ name: 'a_example', views: 2 }]);
    expect(long.info.eventsBeforeRange).toBe(2);
    expect(long.following).toEqual([]);
  });

  it('counts records with no Author as unattributed', async () => {
    const r = await scanOf({ 'posts_viewed.json': posts(view(T), view(T - 60, 'a_example'), view(T - 120)), 'following.json': following() });
    expect([r.totalViewEvents, r.unattributedEvents]).toEqual([3, 2]);
  });

  it('fails loudly when the keys are not Author/Time (for example a translated export)', async () => {
    const e = await exportErrorFrom(
      scanOf({
        'posts_viewed.json': `{"x":[{"string_map_data":{"Autor":{"value":"a_example"},"Zeit":{"timestamp":${T}}}}]}`,
        'following.json': following(),
      }),
    );
    expect(e.code).toBe('unexpected-format');
    expect(e.detail).toContain('Autor, Zeit');
  });

  it('fails loudly on timestamps that are not seconds', async () => {
    const e = await exportErrorFrom(scanOf({ 'posts_viewed.json': posts(view(T * 1000, 'a_example')), 'following.json': following() }));
    expect(e.code).toBe('unexpected-format');
  });

  it('fails loudly when following.json has no handles in its records', async () => {
    const e = await exportErrorFrom(scanOf({ 'posts_viewed.json': posts(view(T, 'a_example')), 'following.json': '{"relationships_following":[{"name":"a"},{"name":"b"}]}' }));
    expect(e.code).toBe('unexpected-format');
    expect(e.message).toMatch(/following\.json/);
  });

  it('asks for the following list when it is missing, and refuses duplicates', async () => {
    const noFollowing = await exportErrorFrom(scanOf({ 'posts_viewed.json': posts(view(T, 'a_example')) }));
    expect(noFollowing.message).toMatch(/Followers and following/);
    const two = await exportErrorFrom(scanOf({ 'a/posts_viewed.json': posts(), 'b/posts_viewed.json': posts(), 'following.json': following() }));
    expect(two.message).toMatch(/2 files named "posts_viewed.json"/);
  });

  it('a mixed JSON and HTML zip is read as JSON', async () => {
    const r = await scanOf({ 'posts_viewed.json': posts(view(T, 'a_example')), 'following.json': following('b_example'), 'videos_watched.html': '<html>' });
    expect(r.totalViewEvents).toBe(1);
  });

  it('record readers handle odd input', () => {
    expect(readViewRecord(null)).toBeNull();
    expect(readViewRecord({ string_map_data: { Time: { timestamp: 'x' } } })).toBeNull();
    expect(readViewRecord({ string_map_data: { Author: { value: ' ' }, Time: { timestamp: T } } })).toEqual({ timeMs: T * 1000, author: null });
    expect(readFollowingRecord({ title: ' example_account_01 ', string_list_data: [{ href: 'x' }] })).toBe('example_account_01');
    expect(readFollowingRecord({ title: '', string_list_data: [] })).toBeNull();
  });
});
