import type { AccountViews, AppId } from '../lib/summary';
import type { ZipArchive } from '../lib/zip';

/** What an adapter gets out of an export. Everything the summary needs except the goal. */
export interface ScanResult {
  app: AppId;
  rangeStart: string;
  rangeEnd: string;
  totalViewEvents: number;
  unattributedEvents: number;
  accounts: AccountViews[];
  following: string[];
  /** Shown to the tester on the preview screen. Never written to the summary file. */
  info: ScanInfo;
}

export interface ScanInfo {
  /** The zip entries that were opened. */
  filesOpened: string[];
  /** Records that could not be read (no usable date). */
  skippedRecords: number;
  /** View events older than the 30-day window, left out of the summary. */
  eventsBeforeRange: number;
  /** Plain notes for the tester, for example "No videos-watched file was in the export." */
  notes: string[];
}

export interface ScanProgress {
  file: string;
  bytesDone: number;
  bytesTotal: number;
}

export type ExportErrorCode =
  | 'not-a-zip'
  | 'html-export'
  | 'files-not-found'
  | 'unexpected-format'
  | 'no-view-events';

/** A parser failure meant to be shown to the tester: a plain message plus the file names found. */
export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message: string,
    /** File names found in the zip (names only), so the tester and builder can see what was there. */
    readonly filesFound: string[] = [],
    /** Extra technical detail for the builder, such as the keys seen in a record. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface Adapter<Found = unknown> {
  app: AppId;
  /** Locates this app's files by name anywhere in the zip. Throws ExportError when they are not there. */
  findFiles(names: string[]): Found;
  /** True when the names look like this app's export at all (JSON or HTML). Used for "wrong app" hints. */
  looksLikeExport(names: string[]): boolean;
  scan(zip: ZipArchive, onProgress?: (p: ScanProgress) => void): Promise<ScanResult>;
}

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
