import { JsonItemStream, JsonStreamError } from '../lib/json-stream';
import type { ZipArchive } from '../lib/zip';
import { ExportError, type ScanProgress } from './types';

/** Streams one JSON entry of the zip, record by record. Format problems become ExportErrors. */
export async function readJsonRecords(
  zip: ZipArchive,
  name: string,
  onRecord: (record: Record<string, unknown>) => void,
  onProgress?: (p: ScanProgress) => void,
): Promise<number> {
  const stream = new JsonItemStream(onRecord);
  const bytesTotal = zip.size(name);
  let bytesDone = 0;
  let failure: unknown;
  try {
    await zip.read(name, (chunk) => {
      if (failure) return;
      try {
        stream.push(chunk);
      } catch (e) {
        failure = e;
      }
      bytesDone += chunk.length;
      onProgress?.({ file: name, bytesDone, bytesTotal });
    });
    if (failure) throw failure;
    stream.end();
  } catch (e) {
    if (e instanceof ExportError) throw e;
    const why = e instanceof JsonStreamError ? e.message : 'The file could not be read from the zip.';
    throw new ExportError(
      'unexpected-format',
      `"${name}" could not be read. ${why}`,
      zip.names,
      e instanceof Error ? e.message : String(e),
    );
  }
  return stream.items;
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Lists the keys of a record, for error details. Keys only, never values. */
export const keysOf = (v: unknown) => (isRecord(v) ? Object.keys(v).join(', ') || '(none)' : typeof v);
