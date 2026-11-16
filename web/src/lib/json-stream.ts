// Streaming reader for big JSON files shaped as a list of records.
//
// It hands back, one at a time, each object that is an element of either
//   - the top-level array:                    [ {...}, {...} ]
//   - an array directly under the top object: { "some_key": [ {...}, {...} ] }
// so a 200,000-entry history file is never held in memory as one string or
// one parsed tree. It works on raw bytes: the structural characters of JSON
// are ASCII, and ASCII bytes never occur inside a multi-byte UTF-8 character.

const QUOTE = 34;
const BACKSLASH = 92;
const OPEN_OBJECT = 123;
const CLOSE_OBJECT = 125;
const OPEN_ARRAY = 91;
const CLOSE_ARRAY = 93;

export class JsonStreamError extends Error {}

export class JsonItemStream {
  /** Objects handed to onItem so far. */
  items = 0;
  private stack: number[] = [];
  private inString = false;
  private escaped = false;
  private started = false;
  private finished = false;
  private capturing = false;
  private captureDepth = 0;
  private parts: Uint8Array[] = [];
  private partBytes = 0;
  private bomBytes = 0;
  private decoder = new TextDecoder('utf-8');

  constructor(
    private onItem: (item: Record<string, unknown>) => void,
    private maxItemBytes = 1_000_000,
  ) {}

  push(chunk: Uint8Array): void {
    let captureStart = this.capturing ? 0 : -1;
    const stack = this.stack;
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]!;
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (b === BACKSLASH) this.escaped = true;
        else if (b === QUOTE) this.inString = false;
        continue;
      }
      if (!this.started) {
        // Skip a UTF-8 byte-order mark and leading white space.
        if (this.bomBytes < 3 && b === [0xef, 0xbb, 0xbf][this.bomBytes]) {
          this.bomBytes++;
          continue;
        }
        if (b === 32 || b === 9 || b === 10 || b === 13) continue;
        if (b !== OPEN_ARRAY && b !== OPEN_OBJECT) {
          throw new JsonStreamError(b === 60 ? 'The file is HTML, not JSON.' : 'The file does not start like a JSON list or object.');
        }
        this.started = true;
      } else if (this.finished && !(b === 32 || b === 9 || b === 10 || b === 13)) {
        throw new JsonStreamError('The file has extra content after the end of its JSON.');
      }
      if (b === QUOTE) {
        this.inString = true;
      } else if (b === OPEN_OBJECT || b === OPEN_ARRAY) {
        if (!this.capturing && b === OPEN_OBJECT) {
          const d = stack.length;
          const itemPosition = (d === 1 && stack[0] === OPEN_ARRAY) || (d === 2 && stack[0] === OPEN_OBJECT && stack[1] === OPEN_ARRAY);
          if (itemPosition) {
            this.capturing = true;
            this.captureDepth = d;
            captureStart = i;
          }
        }
        stack.push(b);
      } else if (b === CLOSE_OBJECT || b === CLOSE_ARRAY) {
        const open = stack.pop();
        if (open !== (b === CLOSE_OBJECT ? OPEN_OBJECT : OPEN_ARRAY)) throw new JsonStreamError('The file is not well-formed JSON (brackets do not match).');
        if (this.capturing && stack.length === this.captureDepth) {
          this.emit(chunk.subarray(captureStart, i + 1));
          this.capturing = false;
          captureStart = -1;
        }
        if (stack.length === 0) this.finished = true;
      }
    }
    if (this.capturing) {
      // Copy: the zip reader may reuse the chunk's buffer.
      const rest = chunk.slice(captureStart);
      this.parts.push(rest);
      this.partBytes += rest.length;
      if (this.partBytes > this.maxItemBytes) throw new JsonStreamError('One record in the file is far larger than expected.');
    }
  }

  /** Call after the last chunk. Throws if the JSON was cut short. */
  end(): void {
    if (!this.started) throw new JsonStreamError('The file is empty.');
    if (!this.finished || this.inString) throw new JsonStreamError('The file ends before its JSON is complete.');
  }

  private emit(last: Uint8Array): void {
    let bytes = last;
    if (this.parts.length) {
      bytes = new Uint8Array(this.partBytes + last.length);
      let at = 0;
      for (const p of this.parts) {
        bytes.set(p, at);
        at += p.length;
      }
      bytes.set(last, at);
      this.parts = [];
      this.partBytes = 0;
    }
    if (bytes.length > this.maxItemBytes) throw new JsonStreamError('One record in the file is far larger than expected.');
    let item: unknown;
    try {
      item = JSON.parse(this.decoder.decode(bytes));
    } catch {
      throw new JsonStreamError(`Record ${this.items + 1} in the file is not valid JSON.`);
    }
    this.items++;
    this.onItem(item as Record<string, unknown>);
  }
}
