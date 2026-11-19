# Morning summary

All ten milestones in `SPEC.md` are built and their tests pass. Using only made-up fixtures, a scan goes from `/scan` to a saved summary, through `/review` to `report.html`, and two summaries go through `/compare`. Nothing has been tried on a real phone or with a real export. Those are the two things to do next.

The work is on branch `claude/new-session-5v06dn` in `Claude_code_mobile`, not `web-test` in `algorithm-health-companion` (see "Decisions" below). It is pushed, with one commit per milestone. No PR has been opened, and nothing has been deployed.

## Run it in three commands

```
cd web
npm install
npm run dev        # then open http://localhost:5173/scan
```

Other commands:

- `npm test` runs 149 unit tests. The first run also generates the two large fixtures, which takes a few seconds.
- `npm run build` makes the static site in `web/dist/`.
- `VITE_AI_ASSISTANT_NAME="Name of assistant" npm run build` makes the build testers should see. It fills in `[AI assistant]` in the consent text.
- `npm run build && npm run e2e` runs 1,005 browser checks. It needs Playwright's Chromium; `npx playwright install chromium` if it is missing.

Fixture zips to try by hand are in `web/fixtures/`. The two `*-large.zip` files appear after the first `npm test`.

## What works (tested)

- **`/scan`**: seven screens: welcome, goal, pick app with export steps, choose file, preview, consent, save.
  - The zip is read in the tab, one entry at a time, and only the two or three files the adapter names are opened.
  - Tests show that messages, searches, contacts and media in the fixtures are never opened.
  - Unit tests trap every network API during a scan. In the browser, a scan made zero requests.
  - The built site also tells the browser to block any outgoing connection.
  - Every bad zip (empty, HTML instead of JSON, unexpected names, the other app's export, not a zip) shows a plain message with the file names found.
- **Summary file**: a test fails if any field outside the ten in the spec is written. The validator also rejects any unexpected field when loading.
- **Large exports**: 210,000 view events scan in about 1.5 seconds in desktop Chromium, with a peak of about 100 MB of JS heap.
- **Scoring**: goal match, coverage, the under-60% rule, and `unknown` left out of the score. All are pure functions with tests, including zero-account and one-account cases.
- **`/review`**:
  - Copy-ready classification request.
  - Strict paste check that names each failing entry and its line.
  - Bucket table with overrides and a running goal match.
  - Confirmation of the top three off-goal accounts.
  - Mentor rules: it refuses a mentor the tester already follows, and one on the other app.
  - Save and reload work in progress.
- **`report.html`**: one 118 KB file with fonts, styles and script inside it.
  - Opening it makes no outside requests.
  - It shows the ring, the goal, a coverage line, three bucket sections, the top three off-goal accounts with their combined share, and mentor cards.
  - Every example account has a "This is wrong" control that gathers corrections into text to copy.
- **`/compare`**:
  - Lists accounts newly followed and unfollowed, each tagged against the report.
  - Counts the changes that match the report.
  - Shows each mentor and off-goal pick.
  - Shows goal match before and after, using the first scan's buckets.
  - On the fixtures, it finds the made-up tester followed one mentor and unfollowed all three off-goal picks.
- **Accessibility, desktop Chromium at 390px**:
  - Every screen is checked for keyboard reach of every control and a visible focus ring.
  - Also checked: names on every control, no skipped heading levels, 44px controls, no sideways scroll, and no emoji.
- **Clean checkout**: `npm install`, `npm test` and `npm run build` succeed.

## What does not work, or is not built

- **Translated exports.** Exports made with a non-English language setting stop with an error listing what was found. They are not parsed.
- **Instagram exports split over several zips** are not handled.
- **The bundle size.** The main bundle is 152 KB gzipped, mostly the zip library. Fine on Wi-Fi; not tuned.
- **Hosting.** Nothing deploys the site. `npm run build` copies `index.html` into each route's folder, so any plain static host works. Set `VITE_BASE` if it lives under a sub-path.

## What you need to test by hand

In this order:

1. **Your own exports.** Run your real Instagram export and YouTube Takeout export through `/scan` on a laptop.
   - The parsers are built from documented formats only.
   - Every assumption is listed at the top of `web/src/adapters/instagram.ts` and `web/src/adapters/youtube.ts`. A mismatch is a one-file fix.
   - If either fails, the error screen lists the file names found. That is what I need to fix it.
2. **The export steps** shown on `/scan` against the real Instagram and Google Takeout menus. I wrote them from memory.
3. **Your iPhone**, and an Android phone if you can borrow one:
   - choosing the zip;
   - a large export in Safari;
   - finding the saved summary file;
   - opening `report.html` from a messaging app, including whether "This is wrong" and Copy work there.

   The full list is under "Needs a real device" in `NIGHT_LOG.md`.
4. **A real assistant's answer** pasted into `/review`. Check it passes the strict check, and see what it does with `unknown`.
5. **A screen reader** (VoiceOver) on `/scan` and the report. Only automated checks were run.
6. **The consent screen** after building with `VITE_AI_ASSISTANT_NAME`.

## Decisions I made for you

The full list, one line each with the reason, is in `web/DECISIONS.md`. These are the ones most worth checking:

- **Repo and branch.** This session could only reach `Claude_code_mobile` and push to `claude/new-session-5v06dn`.
  - All new work is in `web/`, plus `SPEC.md` at the root, so it moves to another repo cleanly.
  - There is no Android code here. `prosper-scout/` was left untouched.
- **The `[AI assistant]` name is set at build time.** A build without `VITE_AI_ASSISTANT_NAME` shows the literal placeholder. Do not send testers that build.
- **Instagram export date range.** The steps tell testers to choose "All time", not the shortest range, so the following list is not cut short. Shorten it once your own export shows that is safe.
- **View counts in the classification request.** The request includes view counts, as the spec says. The consent wording only mentions names and the goal. Removing the counts is one line in `web/src/lib/classification.ts`.
- **The 30-day window counts back from the newest view in the export, not from today.**
- **Unreadable records.** Up to 5% are skipped and counted; more than that stops the scan, so a changed format is never silently half-read.
- **The pasted answer is all or nothing.** Every account listed must be answered, and reasons must be 14 words or fewer.
- **YouTube mentors need a channel name as well as the @handle.** Takeout lists subscriptions by name, so the handle alone cannot be checked.
- **Report export is blocked** until the answer is applied, the off-goal picks are confirmed and at least one mentor is added.
- **Fonts in the report are embedded**, not loaded from Google, so the report makes no outside request at all.
- **"Report data" for `/compare` is the saved review file** (`algorithm-health-review.json`).
- **What counts as a change matching the report** in `/compare`: following a mentor, or unfollowing any account the report put off-goal. Whether a tester passes is still your call.
- **A gap outside 7 to 14 days between scans is a warning, not a refusal.**
- **Fixtures.** The two large fixtures are generated on the first `npm test` and git-ignored, to keep the repo small. I added a "second scan" fixture per app so `/compare` can be tried.
