import { openAsBlob } from 'node:fs';
import { join } from 'node:path';
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js';
import { FIXTURE_DIR } from '../scripts/make-fixtures.mjs';
import { openZip } from '../src/lib/zip';
import { ExportError } from '../src/adapters/types';

/** A fixture zip as a Blob backed by the file on disk (not read into memory). */
export const fixtureBlob = (name: string) => openAsBlob(join(FIXTURE_DIR, name));

export const fixtureZip = async (name: string) => openZip(await fixtureBlob(name));

/** Builds a zip in memory from name -> text. */
export async function zipOf(files: Record<string, string>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  for (const [name, text] of Object.entries(files)) await writer.add(name, new BlobReader(new Blob([text])));
  return writer.close();
}

export async function exportErrorFrom(p: Promise<unknown>): Promise<ExportError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ExportError) return e;
    throw e;
  }
  throw new Error('Expected an ExportError, but the call succeeded.');
}
