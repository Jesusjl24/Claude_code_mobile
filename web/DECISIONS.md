# Decisions made for you

One line each: what I chose, and why. Newest at the bottom of each section.

## Repo and branch

- **Built in `Claude_code_mobile`, not `algorithm-health-companion`.** This session only has access to this repo; all work is in a new `web/` folder plus `SPEC.md` at the root, so it can be copied to another repo wholesale.
- **There is no Android code here.** The existing code is `prosper-scout/` (a Python app). I did not modify, move or delete it.
- **Branch is `claude/new-session-5v06dn`, not `web-test`.** The session I run in is only permitted to push to that branch; rename or cherry-pick it to `web-test` if you want the name from the prompt. No PR opened, nothing pushed to `main`, nothing deployed.

## Scaffold (milestone 1)

- **No router library; a 40-line path router.** Three fixed routes do not need a dependency.
- **`npm run build` copies `index.html` into `scan/`, `review/`, `compare/` and `404.html`.** Hosting is undecided, and this makes the three routes work on any plain static host without rewrite rules.
- **`VITE_BASE` env var sets the base path (default `/`).** Needed if the site ends up under a sub-path such as GitHub Pages.
- **Fonts are self-hosted from the `@fontsource` npm packages, not loaded from Google Fonts.** Keeps the app to "its own files" only, so no tester IP goes to a font CDN.
- **`DECISIONS.md` and `NIGHT_LOG.md` are not empty at the scaffold commit.** The prompt asks for them to be kept up to date from the start; an empty file would have been untrue.
