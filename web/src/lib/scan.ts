// Runs a scan: zip in, ScanResult out, entirely inside the browser tab.
// Nothing in this file or below it makes a network request.
import { instagramAdapter } from '../adapters/instagram';
import { youtubeAdapter } from '../adapters/youtube';
import { ExportError, type Adapter, type ScanProgress, type ScanResult } from '../adapters/types';
import { APP_LABEL, SCHEMA_VERSION, type AppId, type Summary } from './summary';
import { NotAZipError, openZip } from './zip';

export const ADAPTERS: Record<AppId, Adapter> = { instagram: instagramAdapter, youtube: youtubeAdapter };

export async function scanExport(app: AppId, file: Blob, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
  let zip;
  try {
    zip = await openZip(file);
  } catch (e) {
    if (e instanceof NotAZipError) {
      throw new ExportError(
        'not-a-zip',
        `This file could not be opened as a zip. Choose the .zip file exactly as ${app === 'youtube' ? 'Google Takeout' : 'Instagram'} gave it to you, without unzipping it first.`,
        [],
        e.message,
      );
    }
    throw e;
  }
  try {
    return await ADAPTERS[app].scan(zip, onProgress);
  } catch (e) {
    if (e instanceof ExportError && e.code === 'files-not-found') {
      const other: AppId = app === 'youtube' ? 'instagram' : 'youtube';
      if (!ADAPTERS[app].looksLikeExport(zip.names) && ADAPTERS[other].looksLikeExport(zip.names)) {
        throw new ExportError(
          'files-not-found',
          `This zip looks like ${other === 'instagram' ? 'an' : 'a'} ${APP_LABEL[other]} export, but you picked ${APP_LABEL[app]}. Go back and pick ${APP_LABEL[other]}, or choose your ${APP_LABEL[app]} zip instead.`,
          e.filesFound,
        );
      }
    }
    throw e;
  } finally {
    await zip.close().catch(() => {});
  }
}

/** Combines what the adapter found with the tester's goal. Only spec fields are copied. */
export function buildSummary(result: ScanResult, goal: string, now: Date): Summary {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: result.app,
    createdAt: now.toISOString(),
    goal: goal.trim(),
    rangeStart: result.rangeStart,
    rangeEnd: result.rangeEnd,
    totalViewEvents: result.totalViewEvents,
    unattributedEvents: result.unattributedEvents,
    accounts: result.accounts.map((a) => ({ name: a.name, views: a.views })),
    following: [...result.following],
  };
}
