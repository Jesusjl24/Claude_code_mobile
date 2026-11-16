import { describe, expect, it } from 'vitest';
import { JsonItemStream, JsonStreamError } from '../src/lib/json-stream';
import { parseCsv } from '../src/lib/csv';

const enc = new TextEncoder();

function run(text: string, chunkSize: number): unknown[] {
  const out: unknown[] = [];
  const s = new JsonItemStream((item) => out.push(item));
  const bytes = enc.encode(text);
  for (let i = 0; i < bytes.length; i += chunkSize) s.push(bytes.subarray(i, i + chunkSize));
  s.end();
  return out;
}

const tricky = [
  { a: 'plain' },
  { a: 'quote " brace } bracket ] backslash \\ end', nested: { list: [1, [2, { x: '}' }]], s: '[{' } },
  { a: 'é 日本 🙂', b: null, c: [] },
  {},
];

describe('JsonItemStream', () => {
  for (const size of [1, 2, 3, 7, 64, 100_000]) {
    it(`reads a top-level array in ${size}-byte chunks`, () => {
      expect(run(JSON.stringify(tricky), size)).toEqual(tricky);
      expect(run('﻿  ' + JSON.stringify(tricky, null, 2) + '\n', size)).toEqual(tricky);
    });
    it(`reads arrays under a top-level object in ${size}-byte chunks`, () => {
      expect(run(JSON.stringify({ key: tricky, other: { not: [{ an: 'item' }] }, n: 1 }), size)).toEqual(tricky);
    });
  }

  it('ignores non-object elements and yields nothing for empty lists', () => {
    expect(run('[1, "two", [3], null]', 4)).toEqual([]);
    expect(run('[]', 1)).toEqual([]);
    expect(run('{"k":[]}', 1)).toEqual([]);
  });

  it('fails loudly on HTML, truncated or malformed input', () => {
    expect(() => run('<html></html>', 5)).toThrow(/HTML/);
    expect(() => run('hello', 5)).toThrow(JsonStreamError);
    expect(() => run('[{"a":1},{"a":', 5)).toThrow(/before its JSON is complete/);
    expect(() => run('[{"a":1]]', 5)).toThrow(/brackets/);
    expect(() => run('', 5)).toThrow(/empty/);
    expect(() => run('[{"a":1}] [', 5)).toThrow(/extra content/);
    expect(() => run('[{"a":oops}]', 5)).toThrow(/not valid JSON/);
  });

  it('refuses a single enormous record', () => {
    const s = new JsonItemStream(() => {}, 100);
    expect(() => s.push(enc.encode('[{"a":"' + 'x'.repeat(500) + '"}]'))).toThrow(/larger than expected/);
  });
});

describe('parseCsv', () => {
  it('handles quotes, commas, doubled quotes and CRLF', () => {
    expect(parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\n\n2,,z')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', '', 'z'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });
});
