// Instagram adapter: "Download your information" zip (JSON format) -> ScanResult.
//
// UNVERIFIED FORMAT. Everything this file assumes about the export is listed
// here so a real export that differs is a one-file fix:
//
//   1. Posts viewed are in a file named "posts_viewed.json" and videos watched
//      in "videos_watched.json" (any folder; believed to be
//      ads_information/ads_and_topics/). At least one of the two must exist.
//   2. Each of those is a JSON object with one key holding an array (believed
//      to be "impressions_history_posts_seen" / "impressions_history_videos_watched";
//      the key name is not relied on). Each array element looks like
//        { "string_map_data": { "Author": { "value": "<handle>" },
//                               "Time":   { "timestamp": <seconds since 1970> } } }
//      An element with a Time but no Author is a view with no account and is
//      counted as unattributed.
//   3. The following list is a file named "following.json" (any folder),
//      an object with an array (believed "relationships_following") whose
//      elements carry the handle either in string_list_data[0].value or, in
//      newer exports, in "title".
//   4. An export requested as HTML has the same file names ending ".html".
//   5. Exports made with a non-English language setting may use translated
//      keys in place of "Author" and "Time". Those are NOT handled: the scan
//      stops and reports the keys it saw.
//   6. Exports split over several zips are NOT handled; this page reads one zip.
import type { ZipArchive } from '../lib/zip';
import { ViewAggregator, tooManySkipped, unique } from './aggregate';
import { isRecord, keysOf, readJsonRecords } from './read-json';
import { ExportError, baseName, type Adapter, type ScanProgress, type ScanResult } from './types';

export interface InstagramFiles {
  /** posts_viewed.json and/or videos_watched.json */
  views: string[];
  following: string;
  missingViews: string[];
}

const POSTS_VIEWED = /^posts_viewed\.json$/i;
const VIDEOS_WATCHED = /^videos_watched\.json$/i;
const FOLLOWING = /^following\.json$/i;
const HTML_VERSIONS = /^(posts_viewed|videos_watched|following)\.html?$/i;
const AUTHOR_KEY = 'Author';
const TIME_KEY = 'Time';
// Seconds since 1970 for 2010-01-01 and 2100-01-01. A timestamp outside this
// is not a plausible Instagram view time (for example, milliseconds instead of seconds).
const MIN_SECONDS = 1_262_304_000;
const MAX_SECONDS = 4_102_444_800;

function findFiles(names: string[]): InstagramFiles {
  const posts = names.filter((n) => POSTS_VIEWED.test(baseName(n)));
  const videos = names.filter((n) => VIDEOS_WATCHED.test(baseName(n)));
  const following = names.filter((n) => FOLLOWING.test(baseName(n)));
  const anyJson = posts.length + videos.length + following.length > 0;
  if (!anyJson && names.some((n) => HTML_VERSIONS.test(baseName(n)))) {
    throw new ExportError(
      'html-export',
      'This export was made in HTML format, and this page can only read JSON. Please request your Instagram export again and choose "JSON" as the format.',
      names,
    );
  }
  if (posts.length === 0 && videos.length === 0) {
    throw new ExportError(
      'files-not-found',
      'This zip does not look like an Instagram export: no file named "posts_viewed.json" or "videos_watched.json" was found in it. Check that you chose the Instagram zip and that the export included "Ads information".',
      names,
    );
  }
  for (const [label, found] of [['posts_viewed.json', posts], ['videos_watched.json', videos], ['following.json', following]] as const) {
    if (found.length > 1) throw new ExportError('files-not-found', `This zip holds ${found.length} files named "${label}" and this page cannot tell which one to read.`, names);
  }
  if (following.length === 0) {
    throw new ExportError(
      'files-not-found',
      'Your viewed posts are here, but no file named "following.json" was found. Please request your Instagram export again and include "Followers and following".',
      names,
    );
  }
  const missingViews: string[] = [];
  if (posts.length === 0) missingViews.push('posts_viewed.json');
  if (videos.length === 0) missingViews.push('videos_watched.json');
  return { views: [...posts, ...videos], following: following[0]!, missingViews };
}

function looksLikeExport(names: string[]): boolean {
  return names.some((n) => {
    const b = baseName(n);
    return POSTS_VIEWED.test(b) || VIDEOS_WATCHED.test(b) || FOLLOWING.test(b) || HTML_VERSIONS.test(b);
  });
}

/** Reads one viewed-post or watched-video record. Null when it has no usable time. */
export function readViewRecord(record: unknown): { timeMs: number; author: string | null } | null {
  if (!isRecord(record) || !isRecord(record.string_map_data)) return null;
  const time = record.string_map_data[TIME_KEY];
  if (!isRecord(time) || typeof time.timestamp !== 'number') return null;
  const seconds = time.timestamp;
  if (!Number.isFinite(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) return null;
  const authorCell = record.string_map_data[AUTHOR_KEY];
  let author: string | null = null;
  if (isRecord(authorCell) && typeof authorCell.value === 'string' && authorCell.value.trim() !== '') author = authorCell.value.trim();
  return { timeMs: seconds * 1000, author };
}

/** Reads one following record into a handle. Null when no handle can be found. */
export function readFollowingRecord(record: unknown): string | null {
  if (!isRecord(record)) return null;
  const first = Array.isArray(record.string_list_data) ? record.string_list_data[0] : undefined;
  if (isRecord(first) && typeof first.value === 'string' && first.value.trim() !== '') return first.value.trim();
  if (typeof record.title === 'string' && record.title.trim() !== '') return record.title.trim();
  return null;
}

function describeKeys(record: unknown): string {
  if (isRecord(record) && isRecord(record.string_map_data)) return `string_map_data keys: ${keysOf(record.string_map_data)}`;
  return `record keys: ${keysOf(record)}`;
}

async function scan(zip: ZipArchive, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
  const files = findFiles(zip.names);
  const views = new ViewAggregator();
  let skipped = 0;

  for (const file of files.views) {
    let fileSkipped = 0;
    let fileRead = 0;
    let firstBad: string | undefined;
    await readJsonRecords(
      zip,
      file,
      (record) => {
        const r = readViewRecord(record);
        if (!r) {
          fileSkipped++;
          firstBad ??= describeKeys(record);
          return;
        }
        fileRead++;
        views.add(r.timeMs, r.author);
      },
      onProgress,
    );
    if (tooManySkipped(fileSkipped, fileRead)) {
      throw new ExportError(
        'unexpected-format',
        `"${file}" is not laid out the way this page expects: ${fileSkipped} of ${fileSkipped + fileRead} records have no readable time. Nothing was guessed and nothing was saved.`,
        zip.names,
        `In the first unreadable record, ${firstBad}`,
      );
    }
    skipped += fileSkipped;
  }

  const totals = views.finish();
  if (!totals) {
    throw new ExportError(
      'no-view-events',
      `${files.views.map((f) => `"${f}"`).join(' and ')} ${files.views.length > 1 ? 'were' : 'was'} found, but with no viewed posts or videos inside. Try requesting the export again with a longer date range.`,
      zip.names,
    );
  }

  const handles: string[] = [];
  let badFollowing = 0;
  let firstBadFollowing: string | undefined;
  const followingRecords = await readJsonRecords(
    zip,
    files.following,
    (record) => {
      const handle = readFollowingRecord(record);
      if (handle) handles.push(handle);
      else {
        badFollowing++;
        firstBadFollowing ??= keysOf(record);
      }
    },
    onProgress,
  );
  if (badFollowing > 0 && tooManySkipped(badFollowing, followingRecords - badFollowing)) {
    throw new ExportError(
      'unexpected-format',
      `"${files.following}" is not laid out the way this page expects: ${badFollowing} of ${followingRecords} records have no account name. Nothing was guessed and nothing was saved.`,
      zip.names,
      `Fields in the first unreadable record: ${firstBadFollowing}`,
    );
  }

  const notes: string[] = [];
  for (const missing of files.missingViews) notes.push(`No "${missing}" file was in the export, so only the other kind of view is counted.`);
  if (totals.accounts.length === 0) notes.push('None of the view records names an account, so there are no accounts to list.');
  return {
    app: 'instagram',
    rangeStart: totals.rangeStart,
    rangeEnd: totals.rangeEnd,
    totalViewEvents: totals.totalViewEvents,
    unattributedEvents: totals.unattributedEvents,
    accounts: totals.accounts,
    following: unique(handles),
    info: { filesOpened: [...zip.opened], skippedRecords: skipped + badFollowing, eventsBeforeRange: totals.eventsBeforeRange, notes },
  };
}

export const instagramAdapter: Adapter<InstagramFiles> = { app: 'instagram', findFiles, looksLikeExport, scan };
