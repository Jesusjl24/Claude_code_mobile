// A thin wrapper over zip.js. It reads the zip's index, then decompresses only
// the entries it is asked for, one at a time, in chunks. The zip is never read
// whole into memory and no entry is opened unless an adapter names it.
import { BlobReader, ZipReader, configure, type Entry } from '@zip.js/zip.js';

// Decompress on the calling thread through the browser's own streaming
// decompressor. No worker scripts, nothing fetched.
configure({ useWebWorkers: false });

export interface ZipArchive {
  /** Every file name in the zip (folders left out). Names only; nothing is opened. */
  readonly names: string[];
  /** Names of the entries that have actually been opened, in order. */
  readonly opened: string[];
  /** Uncompressed size in bytes of an entry, from the zip index. */
  size(name: string): number;
  /** Decompresses one entry, handing each chunk to `onChunk`. */
  read(name: string, onChunk: (chunk: Uint8Array) => void): Promise<void>;
  /** Decompresses one small entry to text. Throws if it is larger than `maxBytes`. */
  readText(name: string, maxBytes: number): Promise<string>;
  close(): Promise<void>;
}

export class NotAZipError extends Error {}

export async function openZip(file: Blob): Promise<ZipArchive> {
  const reader = new ZipReader(new BlobReader(file));
  let entries: Entry[];
  try {
    entries = await reader.getEntries();
  } catch (e) {
    await reader.close().catch(() => {});
    throw new NotAZipError(e instanceof Error ? e.message : String(e));
  }
  const byName = new Map<string, Entry>();
  for (const entry of entries) if (!entry.directory) byName.set(entry.filename, entry);
  const opened: string[] = [];

  const get = (name: string) => {
    const entry = byName.get(name);
    if (!entry || entry.directory) throw new Error(`No file named "${name}" in the zip.`);
    return entry;
  };

  const read = async (name: string, onChunk: (chunk: Uint8Array) => void) => {
    const entry = get(name);
    opened.push(name);
    await entry.getData(
      new WritableStream<Uint8Array>({
        write(chunk) {
          onChunk(chunk);
        },
      }),
    );
  };

  return {
    names: [...byName.keys()],
    opened,
    size: (name) => get(name).uncompressedSize,
    read,
    async readText(name, maxBytes) {
      const size = get(name).uncompressedSize;
      if (size > maxBytes) throw new Error(`"${name}" is ${size} bytes, larger than the ${maxBytes} expected for this file.`);
      const decoder = new TextDecoder('utf-8');
      let text = '';
      await read(name, (chunk) => {
        text += decoder.decode(chunk, { stream: true });
      });
      return text + decoder.decode();
    },
    close: () => reader.close(),
  };
}
