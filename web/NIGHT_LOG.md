# Night log

Updated at every milestone. If the session stopped, the last entry is the true state.

## Status

| # | Milestone | State |
|---|-----------|-------|
| 1 | Scaffold | done — `npm test` (3 router tests) and `npm run build` pass |
| 2 | Summary shape and fixtures | done — 19 tests (validator, field whitelist, fixture files exist) |
| 3 | YouTube adapter | done — 18 adapter tests + 15 streaming-reader/CSV tests, all five fixtures incl. 210k events |
| 4 | Instagram adapter | done — 16 adapter tests, all five fixtures incl. 210k events and the HTML-export error |
| 5 | /scan | done — 15 unit tests (network trap, allowed fields, errors, consent wording, source guards) + browser run at 390px in desktop Chromium |
| 6 | Scoring | done — 12 unit tests incl. zero and one-account cases |
| 7 | /review | done — 27 unit tests (request text, strict paste check, overrides, picks, mentor rules, save/reload) + browser run for both apps |
| 8 | report.html export | in progress |
| 9 | /compare | not started |
| 10 | Hardening | not started |

## Needs a real device

- Nothing has been run on an iPhone or any phone. Everything about phones is untested (list grows below as features land).

## Log

- **M1 Scaffold — done.** Vite + React + TypeScript + Vitest in `web/`, routes `/scan` `/review` `/compare` (placeholders), colours and self-hosted fonts. `SPEC.md` saved at the repo root from the PDF. Untested: nothing has been opened in a browser yet.
- **M2 Summary shape and fixtures — done.** `src/lib/summary.ts` (type, strict validator, whitelist writer) and 12 fixture zips from `scripts/make-fixtures.mjs`. The fixture layouts are my best understanding of the real exports, not verified against one.
- **M3 YouTube adapter — done.** Finder, streaming parser, 30-day window, unattributed count, subscriptions. Tested against normal, empty, HTML, unexpected-names and large fixtures plus hand-made edge cases. Untested: any real Takeout export; the format assumptions are listed at the top of `src/adapters/youtube.ts`.
- **M4 Instagram adapter — done.** Finder, streaming parser for posts viewed + videos watched, following list (two shapes), HTML-export message. Untested: any real Instagram export; assumptions are listed at the top of `src/adapters/instagram.ts`.
- **M5 /scan — done.** Seven screens, preview, consent text word-for-word from the spec, save file. Unit tests trap fetch/XHR/WebSocket/beacon/Worker during scans of all fixtures; Playwright run in desktop Chromium at 390x844 confirms zero requests during a scan, nothing in browser storage, no sideways scroll, 44px controls, focus moves to each new heading. Large fixtures: about 1s each, sampled JS heap peak under 100 MB. Needs a real device: choosing a zip from the Files app on iPhone/Android, whether Safari can open a large zip, whether the saved file lands somewhere findable.
- **M6 Scoring — done.** `src/lib/scoring.ts`: goal match, coverage, under-60% rule, unknown/unlisted handling, the 80%/150 review list. Pure functions, unit tested.
- **M7 /review — done.** Load summary, classification request, strict paste validation with entry and line numbers, bucket table with overrides and running goal match, off-goal confirmation, mentor rules, save and reload work in progress. Checked in desktop Chromium at 1280px and 390px. Untested: a real assistant's answer (only a made-up one was pasted); clipboard copy was not exercised in the browser run.
