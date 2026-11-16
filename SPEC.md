# Algorithm Health — Claude Code prompt and build spec

Nov 16, 2026 · @Jesus L

> Transcribed from the PDF "Algorithm Health — Claude Code prompt and build spec".
> Wording is kept as written; only the layout was converted to Markdown.

## How to use this

Paste the prompt in the next section into Claude Code, with the rest of this doc saved as
`SPEC.md` at the root of the repo. If you can't add the file first, paste the whole doc after
the prompt instead; the prompt handles both.

This spec assumes you accepted the reviewers' changes: Instagram and YouTube only, no
screen recordings, the export is read on the tester's device, three buckets, and success
judged on a second export. It also takes the smaller build: no server, no database, no
logins.

Before you leave it running:

- [ ] Request your own Instagram export tonight (JSON format, no media, shortest date
  range offered) and a YouTube history export from Google Takeout. The parsers are
  built from documented formats and are assumptions until one real export has gone
  through them.
- [ ] Check Claude Code is set to work without stopping for approval on file edits, installs
  and commits. Whether it runs all night depends on that setup and its session limits,
  which this prompt can't control.
- [ ] Confirm the repo is the one you want. The prompt assumes `algorithm-health-companion`
  and puts everything in a new `web/` folder on a new branch, leaving the
  Android code alone.

## The prompt to paste

```
You are building the first test version of Algorithm Health. Work through the
night without me. I will read your results in the morning.

READ FIRST
- Read SPEC.md at the repo root. If it is missing, the spec is pasted below
this prompt: save it as SPEC.md before doing anything else.
- Look over the existing repo so you know what is there. Do not modify, move
or delete any existing code. All new work goes in a new top-level folder
called web/.

BRANCH AND COMMITS
- Create a branch called web-test from the default branch and work only
there.
- Commit after every milestone in SPEC.md, with a message naming the
milestone. Push the branch after each commit if you are able to.
- Never push to the default branch, never force-push, never open or merge a
pull request, never deploy anything.

HOW TO WORK UNATTENDED
- Do not stop to ask me questions. When something is unclear, choose the
option that best fits SPEC.md, and record the choice in web/DECISIONS.md with
one line on why.
- Keep web/NIGHT_LOG.md up to date: what is finished, what is in progress,
what failed and what you tried. Update it at every milestone so a stopped
session still leaves a true record.
- Follow the milestone order in SPEC.md. Finish and test one before starting
the next. If a milestone is blocked after three real attempts, write down
why, stub it clearly, and move on.
- When all milestones are done, do not invent new features. Use remaining
time on the tests, the fixtures, edge cases in the parsers, and accessibility
on a 390px wide screen.

HARD LIMITS
- No backend, no database, no accounts, no analytics, no third-party scripts,
no network calls from the app at runtime other than loading its own files and
fonts.
- No API keys and no calls to any AI service. The spec explains how
classification is done by hand.
- No real personal data. Use only the made-up fixtures you create. Never
invent real social media handles; fixtures use obviously fake names like
@example_account_01.
- Do not write code that scrapes or calls Instagram, YouTube or any other
platform.
- The raw export file must never leave the browser tab. If you find yourself
writing an upload of the zip, stop: that breaks the spec.
- Do not spend money or sign up for any service.

HONESTY
- The export formats in SPEC.md are unverified. Build each parser as a small
adapter with its own tests, and make it fail loudly with a clear message when
a file does not look as expected. Never guess silently.
- Do not claim anything works on an iPhone. You cannot test that. List it
under "Needs a real device" in NIGHT_LOG.md.
- Do not mark a milestone done unless its tests pass. Say plainly what is
untested.

FINISH
- End with web/MORNING.md: what works, what does not, how to run it in three
commands, what I need to test by hand, and every decision you made for me.
```

## Spec: what this test is

Algorithm Health tells a person what share of the posts they viewed serves a goal they
state, shows the accounts behind that number, and suggests who to follow instead. This
build exists to answer one question with about five friends: does the report change who
they follow?

**Success:** at least 3 of 5 testers have a changed following list in a second export, taken 7 to
14 days after their report, where the changes match the report. 2 of 5 is a fail.

**In scope**

- Instagram and YouTube only, one app per tester.
- Input is the tester's official data export, opened on their own device.
- Three buckets: on-goal, neutral, off-goal.
- Classification and mentor picks done by the builder by hand, outside the app, then
  checked in a builder tool.
- A report the builder sends to the tester as one self-contained page.
- A comparison of first and second export.

**Out of scope, do not build**

- TikTok, X, screen recordings, video or image processing of any kind.
- A server, database, logins, notifications, payments.
- Calls to any AI service from the app.
- Installable app features, offline caching, a profile screen, trend charts.
- The Android code already in the repo. Leave it untouched.

**Stack:** a static site in `web/`, built with Vite, React and TypeScript, with Vitest for tests.
Three routes: `/scan`, `/review`, `/compare`. Read zip entries one at a time with a streaming
zip reader so a large export is never loaded whole into memory.

## Spec: pages and data flow

Nothing is sent anywhere by the app. Files move between tester and builder by whatever
the two of them already use to message each other.

1. **Tester opens `/scan` on their phone or laptop.** They type their goal, pick Instagram or
   YouTube, and follow short steps for requesting the export.
2. **Tester chooses the export zip.** The page reads only the files it needs, inside the
   browser tab.
3. **Tester sees exactly what will be shared**: date range, number of view events, number
   of accounts, the top ten accounts by views, and the size of their following list. Nothing
   else is in the file.
4. **Tester ticks consent and saves a summary file** (`algorithm-health-summary.json`),
   then sends it to the builder.
5. **Builder opens `/review` on a laptop** and loads the summary. The page lists the
   accounts that together cover at least 80% of views, capped at 150.
6. **Builder copies a ready-made classification request** from the page into an AI assistant
   of their choice, and pastes the answer back. The page validates it and shows every
   account with its bucket, which the builder can override.
7. **Builder adds mentors** (handle, one-line reason) and confirms the top three off-goal
   accounts.
8. **Builder exports `report.html`**, one self-contained file, and sends it to the tester.
9. **7 to 14 days later the tester repeats steps 1 to 4.** Builder loads both summaries in
   `/compare`.

**`/scan` screens:** welcome, goal, pick app with export steps, choose file, preview of what is
shared, consent, save. Show a clear error with the file names found when the zip doesn't
look like the chosen app's export.

**`/review`:** load summary, copy classification request, paste result, bucket table with
overrides and a running goal-match figure, mentor entry, export report. Also save and
reload work in progress as a file.

**`report.html`:** goal-match ring, the goal in the tester's words, coverage line, three bucket
sections each with up to five example accounts and their view share, the top three off-goal
accounts with their combined share, mentor cards linking to each profile on the
scanned app, and a "This is wrong" control on every example account that gathers the
tester's corrections into text they can copy and send back.

**`/compare`:** load two summaries from the same tester plus the report data. Show accounts
newly followed, accounts unfollowed, which of those were mentors or off-goal picks in the
report, and goal match before and after using the first scan's buckets.

**Look:** dark background `#080808`, cards `#141414`, text `#F2F2F2`, muted text `#B8B8B8`,
one accent `#FFB84D`. Syne for headings and the score, DM Sans for body, DM Mono for
numbers and labels. Mobile first at 390px wide, buttons at least 44px tall, real buttons and
labelled inputs, no emoji.

## Spec: parsing, scoring and report rules

**Parsers.** One adapter per app in `web/src/adapters/`, each turning a zip into the same
summary shape. Every format detail below is unverified and must be isolated so it is a
one-file fix.

- **Instagram:** the export is expected to hold records of posts viewed and videos
  watched, each with the author's name and a timestamp, plus a following list. Accept
  JSON exports only; if the zip holds HTML, tell the tester to request JSON.
- **YouTube:** Google Takeout watch history, expected as a JSON list of entries with a time
  and, it is assumed, the channel name; plus subscriptions as the following list. Skip
  entries with no channel and count them as unattributed.
- Each adapter has a file-finder that locates its files by name pattern anywhere in the
  zip, and a loud failure listing what it found when nothing matches.

**Summary file.** `schemaVersion`, `app`, `createdAt`, `goal`, `rangeStart`, `rangeEnd`,
`totalViewEvents`, `unattributedEvents`, `accounts` (handle or channel name, view
count), `following` (handles). Use the most recent 30 days of view events, or the whole
range if the export covers less. Nothing else from the export may appear in this file; add a
test that fails if any other field is written.

**Classification request.** The text the builder copies contains the goal and the listed
accounts with view counts, and asks for JSON back: for each account, a bucket of `on-goal`,
`neutral` or `off-goal` and a reason of under 15 words. It must tell the assistant to
answer `unknown` when a name alone is not enough to judge. Validate the pasted answer
strictly and show which lines failed.

**Scoring.**

- Unit is view events. The exports carry no watch time.
- Goal match % = on-goal view events ÷ classified view events, rounded to a whole
  number.
- Coverage % = classified view events ÷ all attributed view events. Always shown
  beside the score.
- `unknown` and unlisted accounts are unclassified and excluded from the score, never
  counted as off-goal.
- If coverage is under 60%, the report shows "Not enough classified to score" instead
  of a number.
- Label the number "share of posts you viewed", not "share of your time".

**Mentors.** Entered by the builder. The page refuses a mentor the tester already follows
and one on a different app from the scan.

**Fixtures.** Create made-up export zips for both apps in `web/fixtures/`: a normal one, an
empty one, one with HTML instead of JSON, one with unexpected file names, and a large
one of at least 200,000 view events to test memory use.

## Spec: privacy rules and consent copy

The one rule that can't bend: the raw export never leaves the tester's device. Everything
else follows from that.

- The page reads the zip in the browser tab and makes no network request while doing
  so. Add a test that fails if any fetch or upload is attempted during a scan.
- The page opens only the files the adapter names. Messages, searches, contacts and
  media are never opened.
- The summary file is the only thing that leaves, and the tester sends it themselves
  after seeing what is in it.
- The builder's tools hold data only in the open tab and in files the builder saves. No
  browser storage of tester data.
- The report file holds account names, so it goes only to the tester it belongs to.

**Consent screen wording.** Use this text as written; `[AI assistant]` is filled in by the
builder before testers see it.

> **What this page reads.** Only two things in your export: the accounts whose posts you
> viewed, with dates, and the list of accounts you follow. It does not open your
> messages, searches, contacts or photos.
>
> **What leaves your device.** Nothing, until you send it. This page makes one small file
> with account names, view counts and your goal. You can see what is in it before you
> send it to me.
>
> **Who sees it.** Me. I also paste the account names and your goal into [AI assistant], run
> by a company overseas, to sort them into groups. I check the result by hand.
>
> **How long I keep it.** Until the test ends or you ask me to delete it, whichever is first. I
> keep it that long because I compare it with your second export.
>
> **Your choice.** You can stop at any point, and I'll delete your file when you ask.

## Spec: milestones, tests and done

Build in this order. Each milestone ends with passing tests and a commit.

1. **Scaffold.** `web/` with Vite, React, TypeScript, Vitest, the three routes, the colours and
   fonts, and empty `DECISIONS.md` and `NIGHT_LOG.md`.
2. **Summary shape and fixtures.** The summary type, its validator, and all fixture zips for
   both apps.
3. **YouTube adapter.** Finder, parser, 30-day window, unattributed count. Tested against
   every fixture.
4. **Instagram adapter.** Same, plus the HTML-export error.
5. **`/scan`.** All screens, preview of what is shared, consent, save file. Test that no network
   request happens during a scan and that the saved file holds only the allowed fields.
6. **Scoring.** Goal match, coverage, the under-60% rule, unknown handling. Pure
   functions with unit tests, including zero and one-account cases.
7. **`/review`.** Load summary, classification request text, strict paste validation, overrides,
   mentor rules, save and reload work in progress.
8. **`report.html` export.** One self-contained file with no outside requests except fonts,
   working on a 390px screen, with the corrections control.
9. **`/compare`.** Following-list changes matched against the report, and before-and-after
   goal match.
10. **Hardening.** The large fixture runs without the tab running out of memory in a desktop
    browser; keyboard and screen-reader pass on every screen; `MORNING.md` written.

**Done means**

- `npm install`, `npm test` and `npm run build` all succeed in `web/` from a clean
  checkout.
- A made-up export can go from `/scan` to a saved summary, through `/review` to a
  report file, and two summaries through `/compare`, using fixtures only.
- Every parser failure shows the tester a plain message and the file names found.
- `MORNING.md` lists what was not tested, including everything that needs a real phone
  or a real export.

## Open questions and unverified facts

These are for you, not for Claude Code. None of them blocks tonight's build.

- **Export formats are unverified.** The Instagram and YouTube details came from two
  reviewer agents citing the pages below; nobody has run a real export through this.
  Your own two exports are the first real test.
- **iPhone browser and large zips.** Nobody could confirm that Safari on an iPhone can
  open a large Instagram export. Test with your own export first; the fallback is the
  tester doing the scan on a laptop.
- **Export wait.** One guide says an Instagram export can take up to 14 days and the
  download link expires after 4. Testers should request theirs before the app is ready.
- **Which testers.** Anyone who mainly scrolls TikTok or X needs swapping out. Recruiting
  seven or eight people to end with five is the reviewers' suggestion.
- **Which AI assistant** you paste account names into. Its name goes in the consent text,
  and its data retention is worth reading first.
- **Hosting.** The build is a static site and nothing here deploys it. Where it lives, and
  whether the repo is private, are still to decide.
- **Australian privacy law.** A reviewer thought a hobby test by an individual is probably
  outside the Privacy Act, but that is unverified and not legal advice.
- **"2 of 5 is a fail."** Written into the success rule on the reviewers' suggestion. Change it
  now if you disagree, not after the results are in.
- **Mute links.** Whether either app supports a direct link to mute an account is
  unverified, so the report links to profiles.

**Sources the reviewers cited** (not opened or checked by me; the link targets did not
survive the PDF, only their titles)

- Instagram viewed-posts format
- YouTube Takeout history format
- TikTok watch history format
- X archive layout
- Instagram export timing
