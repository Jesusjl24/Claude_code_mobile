# Night log

Updated at every milestone. If the session stopped, the last entry is the true state.

## Status

| # | Milestone | State |
|---|-----------|-------|
| 1 | Scaffold | done — `npm test` (3 router tests) and `npm run build` pass |
| 2 | Summary shape and fixtures | done — 19 tests (validator, field whitelist, fixture files exist) |
| 3 | YouTube adapter | in progress |
| 4 | Instagram adapter | not started |
| 5 | /scan | not started |
| 6 | Scoring | not started |
| 7 | /review | not started |
| 8 | report.html export | not started |
| 9 | /compare | not started |
| 10 | Hardening | not started |

## Needs a real device

- Nothing has been run on an iPhone or any phone. Everything about phones is untested (list grows below as features land).

## Log

- **M1 Scaffold — done.** Vite + React + TypeScript + Vitest in `web/`, routes `/scan` `/review` `/compare` (placeholders), colours and self-hosted fonts. `SPEC.md` saved at the repo root from the PDF. Untested: nothing has been opened in a browser yet.
- **M2 Summary shape and fixtures — done.** `src/lib/summary.ts` (type, strict validator, whitelist writer) and 12 fixture zips from `scripts/make-fixtures.mjs`. The fixture layouts are my best understanding of the real exports, not verified against one.
