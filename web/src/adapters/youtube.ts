// YouTube adapter: Google Takeout zip -> ScanResult.
//
// UNVERIFIED FORMAT. Everything this file assumes about Takeout is listed here
// so a real export that differs is a one-file fix:
//
//   1. Watch history is a file named "watch-history.json" (any folder).
//      Takeout's default is HTML ("watch-history.html"); the tester has to
//      pick JSON when requesting the export.
//   2. That file is one JSON array. Each element is an object with
//        "time":      ISO date-time string, e.g. "2026-11-10T11:58:00.000Z"
//        "subtitles": [ { "name": "<channel name>", "url": "..." } ]   (may be absent)
//      An element with no subtitles[0].name is a view with no channel
//      (removed videos, some adverts) and is counted as unattributed.
//   3. Subscriptions are a file named "subscriptions.csv" (any folder) with a
//      header row that has a "Channel Title" column.
//   4. Accounts with a non-English language setting may get translated file
//      and column names. Those are NOT handled: the scan stops with the
//      names it found.
import { parseCsv } from '../lib/csv';
import type { ZipArchive } from '../lib/zip';
import { ViewAggregator, tooManySkipped, unique } from './aggregate';
import { isRecord, keysOf, readJsonRecords } from './read-json';
import { ExportError, baseName, type Adapter, type ScanProgress, type ScanResult } from './types';

export interface YouTubeFiles {
  watchHistory: string;
  subscriptions: string;
}

const HISTORY_JSON = /^watch-history\.json$/i;
const HISTORY_HTML = /^watch-history\.html?$/i;
const SUBSCRIPTIONS_CSV = /^subscriptions\.csv$/i;
const TITLE_COLUMN = 'channel title';
const MAX_SUBSCRIPTIONS_BYTES = 20_000_000;

function findFiles(names: string[]): YouTubeFiles {
  const history = names.filter((n) => HISTORY_JSON.test(baseName(n)));
  const subscriptions = names.filter((n) => SUBSCRIPTIONS_CSV.test(baseName(n)));
  if (history.length === 0) {
    if (names.some((n) => HISTORY_HTML.test(baseName(n)))) {
      throw new ExportError(
        'html-export',
        'This export holds your watch history as HTML, and this page can only read JSON. Please request the export again from Google Takeout and, under YouTube, change the history format from HTML to JSON.',
        names,
      );
    }
    throw new ExportError(
      'files-not-found',
      'This zip does not look like a YouTube export from Google Takeout: no file named "watch-history.json" was found in it. Check that you chose the Takeout zip and that YouTube history was included.',
      names,
    );
  }
  if (history.length > 1) {
    throw new ExportError('files-not-found', `This zip holds ${history.length} files named "watch-history.json" and this page cannot tell which one to read.`, names);
  }
  if (subscriptions.length === 0) {
    throw new ExportError(
      'files-not-found',
      'Your watch history is here, but no file named "subscriptions.csv" was found. Please request the export again from Google Takeout with both "history" and "subscriptions" ticked under YouTube.',
      names,
    );
  }
  if (subscriptions.length > 1) {
    throw new ExportError('files-not-found', `This zip holds ${subscriptions.length} files named "subscriptions.csv" and this page cannot tell which one to read.`, names);
  }
  return { watchHistory: history[0]!, subscriptions: subscriptions[0]! };
}

function looksLikeExport(names: string[]): boolean {
  return names.some((n) => {
    const b = baseName(n);
    return HISTORY_JSON.test(b) || HISTORY_HTML.test(b) || SUBSCRIPTIONS_CSV.test(b);
  });
}

/** Reads one watch-history record. Returns the time and channel, or null when the record has no usable time. */
export function readWatchRecord(record: unknown): { timeMs: number; channel: string | null } | null {
  if (!isRecord(record) || typeof record.time !== 'string') return null;
  const timeMs = Date.parse(record.time);
  if (Number.isNaN(timeMs)) return null;
  let channel: string | null = null;
  const first = Array.isArray(record.subtitles) ? record.subtitles[0] : undefined;
  if (isRecord(first) && typeof first.name === 'string' && first.name.trim() !== '') channel = first.name.trim();
  return { timeMs, channel };
}

/** Reads subscriptions.csv text into channel titles. */
export function readSubscriptions(csvText: string, fileName: string, filesFound: string[]): string[] {
  const rows = parseCsv(csvText);
  const header = rows[0];
  if (!header) throw new ExportError('unexpected-format', `"${fileName}" is empty, so your subscriptions could not be read.`, filesFound);
  const column = header.findIndex((h) => h.trim().toLowerCase() === TITLE_COLUMN);
  if (column < 0) {
    throw new ExportError(
      'unexpected-format',
      `"${fileName}" does not have the "Channel Title" column this page expects, so your subscriptions could not be read.`,
      filesFound,
      `Header row found: ${header.join(' | ')}`,
    );
  }
  const titles: string[] = [];
  for (const row of rows.slice(1)) {
    const title = row[column]?.trim();
    if (title) titles.push(title);
  }
  return unique(titles);
}

async function scan(zip: ZipArchive, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
  const files = findFiles(zip.names);
  const views = new ViewAggregator();
  let skipped = 0;
  let firstBadKeys: string | undefined;

  await readJsonRecords(
    zip,
    files.watchHistory,
    (record) => {
      const r = readWatchRecord(record);
      if (!r) {
        skipped++;
        firstBadKeys ??= keysOf(record);
        return;
      }
      views.add(r.timeMs, r.channel);
    },
    onProgress,
  );

  if (tooManySkipped(skipped, views.size)) {
    throw new ExportError(
      'unexpected-format',
      `"${files.watchHistory}" is not laid out the way this page expects: ${skipped} of ${skipped + views.size} entries have no readable "time". Nothing was guessed and nothing was saved.`,
      zip.names,
      `Fields in the first unreadable entry: ${firstBadKeys}`,
    );
  }
  const totals = views.finish();
  if (!totals) {
    throw new ExportError(
      'no-view-events',
      `"${files.watchHistory}" was found, but it has no watch history in it. If your YouTube watch history is switched off or was cleared, there is nothing for this page to count.`,
      zip.names,
    );
  }

  let csvText: string;
  try {
    csvText = await zip.readText(files.subscriptions, MAX_SUBSCRIPTIONS_BYTES);
  } catch (e) {
    throw new ExportError('unexpected-format', `"${files.subscriptions}" could not be read from the zip.`, zip.names, e instanceof Error ? e.message : String(e));
  }
  const following = readSubscriptions(csvText, files.subscriptions, zip.names);

  const notes: string[] = [];
  if (totals.accounts.length === 0) notes.push('None of the watch-history entries names a channel, so there are no accounts to list.');
  return {
    app: 'youtube',
    rangeStart: totals.rangeStart,
    rangeEnd: totals.rangeEnd,
    totalViewEvents: totals.totalViewEvents,
    unattributedEvents: totals.unattributedEvents,
    accounts: totals.accounts,
    following,
    info: { filesOpened: [...zip.opened], skippedRecords: skipped, eventsBeforeRange: totals.eventsBeforeRange, notes },
  };
}

export const youtubeAdapter: Adapter<YouTubeFiles> = { app: 'youtube', findFiles, looksLikeExport, scan };
