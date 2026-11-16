// Makes sure every fixture zip exists before tests run. The small ones are
// committed; the large ones (200k+ view events) are generated here on first run.
import { makeFixtures } from '../scripts/make-fixtures.mjs';

export default async function setup() {
  const made = await makeFixtures({ all: true, onlyMissing: true });
  if (made.length) console.log(`Generated fixtures: ${made.join(', ')}`);
}
