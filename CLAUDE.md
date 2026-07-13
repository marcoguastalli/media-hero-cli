# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## What this is

A Node.js CLI that batch-downloads Instagram post/reel media from a
text file of URLs. It is a terminal port of the `media-hero-catch`
Firefox extension (sibling repo) — same media coverage (posts, carousels
capped at 10 items, reels), same filename numbering convention, ported
patterns rather than shared code. Public content only in v1; the
extractor options object already carries an unused `cookiesFile` field
as the seam for a future `--cookies` flag.

## Commands

```bash
pnpm install         # pnpm only (nvm-installed, never Homebrew)
pnpm test            # full Jest suite (native ESM)
pnpm test:unit       # tests/unit only
pnpm test:integration
pnpm test:coverage   # coverage with 90% global thresholds
pnpm lint / lint:fix # ESLint
pnpm format / format:check
pnpm validate        # lint + format:check + test:coverage — the acceptance gate
```

Run a single test file: `pnpm test -- --testPathPatterns=queue`
(Jest 30 renamed the flag — it is `--testPathPatterns`, plural).

## Architecture

Sequential pipeline; every stage is a small module and all
side-effectful collaborators are injected (see Testing).

```
src/cli.js                  entry point: parseArgs → wires real deps → runApp
src/app.js                  orchestrator: parse → skip/extract/download →
                            manifest → report; returns {exitCode, results}
src/config.js               central CONFIG + validateDelay (clamps 0–30000)
src/input/url-parser.js     txt → {url, type, shortcode}; /p/ post, /reel(s)/ reel
src/extractors/registry.js  ordered chain; requires-login is terminal,
                            other errors fall through; warns once per
                            missing tool
src/extractors/gallery-dl.js    primary: spawns gallery-dl; parses stdout
                                paths → directDownload (files already on
                                disk); maps stderr to typed errors
src/extractors/playwright-extractor.js  fallback: headless Firefox,
                                        runs dom-detect via page.evaluate
src/extractors/dom-detect.js    browser-context detection functions
src/extractors/errors.js        ExtractorError + ERROR_CODES
src/download/filenames.js       extension guessing, carousel numbering
src/download/queue.js           sequential fetch → stream to file; retry
                                w/ backoff [2000,4000,8000]; verifyFiles
                                for directDownload results
src/manifest/manifest.js        manifest.json load/record; written after
                                every URL (resume/skip)
src/report/reporter.js          progress lines + summary via
                                process.stdout.write
```

Key flow detail: the **shortcode** is the post's identity everywhere —
output folder name, manifest key, dedupe key. Statuses are `completed`,
`skipped`, `failed`, `requires-login`, `invalid-url`, `dry-run`; exit
code 0 only if all results are completed/skipped/dry-run. gallery-dl
downloads files itself (`directDownload` → queue only verifies);
Playwright returns media URLs the queue then fetches.

## Constraints that are easy to break

- **`src/extractors/dom-detect.js` functions must stay fully
  self-contained** (no imports, no closure references, helpers declared
  inside the function) — they are serialized into the page by
  `page.evaluate()`. The file has an ESLint browser-env override.
- **Native ESM Jest, no Babel**: `"type": "module"`,
  `NODE_OPTIONS=--experimental-vm-modules`, `"transform": {}`.
  `jest.mock` is not available for ESM — testability comes from
  dependency injection (`spawnFn`, `launchFn`, `fetchFn`, `sleepFn`).
  Keep it that way.
- **`src/cli.js` is excluded from coverage** and kept thin; logic
  belongs in `app.js`.
- **pnpm-workspace.yaml `allowBuilds`** approves the `unrs-resolver`
  postinstall script; without it `pnpm install` (and every script) fails
  on pnpm 11.3.0. Also: never add a `devEngines.packageManager` block to
  package.json — it breaks `pnpm add` on 11.3.0; `"packageManager":
"pnpm@11.3.0"` is the working form.

## Testing

- **No real network, gallery-dl, or Playwright in tests.** Fakes are
  passed through the DI seams: a scripted `spawnFn` (EventEmitter child)
  for gallery-dl, a fake browser via `launchFn` for Playwright, a fake
  `fetchFn` returning `ReadableStream` bodies for the queue.
- `tests/unit/dom-detect.test.js` runs under jsdom
  (`@jest-environment jsdom` docblock) against HTML fixtures in
  `tests/fixtures/dom/`. jsdom returns zero-sized rects, so tests that
  exercise the size filter mock `getBoundingClientRect` per element.
- `tests/integration/pipeline.test.js` uses the real fs in `mkdtemp`
  dirs with only the chain and fetch faked; it asserts manifest content,
  folder layout, and exit codes.
- Coverage thresholds are 90% global (branches included). The only
  intentionally uncovered lines are `defaultLaunch` in
  playwright-extractor.js (launches a real browser).

## Code style

ESLint: max complexity 10, max 50 lines per function (off in tests),
`console.log` banned (reporter uses `process.stdout.write`; diagnostics
use `console.warn`/`console.error`). Prettier: single quotes, 2-space
indent, ES5 trailing commas, 80 width, `arrowParens: avoid`.
Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, …). When a
GitHub remote is added, it must use the SSH alias
`git@github.com_mg:marcoguastalli/media-hero-cli.git` (see workspace
CLAUDE.md).
