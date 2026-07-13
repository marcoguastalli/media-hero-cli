# media-hero-cli

Batch-download Instagram post media (images/videos) from a plain-text
file of URLs — a terminal companion to the
[media-hero-catch](../media-hero-catch) Firefox extension, covering the
batch use case with no browser UI involved.

```bash
media-hero-cli urls.txt --out ./downloads --delay 3000
```

reads `urls.txt` (one Instagram URL per line), downloads every post's
media into per-post subfolders, skips URLs already downloaded on
previous runs, and prints a summary.

## Features

- **Posts, carousels (up to 10 items), and reels** — same media
  coverage as the extension.
- **Hybrid extraction**: [gallery-dl](https://github.com/mikf/gallery-dl)
  as the primary extractor, with a Playwright headless-Firefox fallback
  that applies the extension's DOM heuristics. Extractors are tried in
  order until one succeeds.
- **Resume / skip**: a `manifest.json` in the output directory records
  every processed URL. Completed posts are skipped on re-run (unless
  `--force`); failures are retried. The manifest is written after each
  URL, so an interrupted run loses nothing.
- **Rate limiting**: sequential processing with a configurable delay
  between URLs.
- **Public content only** (v1): no login or cookies. Login-walled posts
  are reported with a distinct `requires-login` status instead of a
  generic failure.

## Installation

Requires Node.js ≥ 20 and [pnpm](https://pnpm.io/).

```bash
pnpm install

# primary extractor (recommended)
pip install gallery-dl

# fallback browser (used when gallery-dl is missing or fails)
npx playwright install firefox
```

Either extractor alone is enough: without gallery-dl the tool falls
back to Playwright and prints a one-time install hint.

## Usage

```
media-hero-cli <urls.txt> [options]

  --out DIR     output directory (default: ./downloads)
  --delay MS    delay between URLs in ms (default: 3000, clamped 0–30000)
  --force       re-download URLs already marked completed
  --dry-run     parse, classify, and report; no network, no writes
  --verbose     per-step logging (extractor attempts, retries)
  --help, --version
```

Run it locally with `pnpm start urls.txt` or `node src/cli.js urls.txt`.

### Input file

One URL per line; blank lines and lines starting with `#` are ignored.

```
# my saved posts
https://www.instagram.com/p/C7xKp2AbCdE/
https://www.instagram.com/reel/D8yLq3BcDeF/
```

Recognized paths: `/p/<shortcode>/` (post) and `/reel/<shortcode>/` or
`/reels/<shortcode>/` (reel). Anything else — profiles, stories,
non-Instagram hosts — is rejected per-line with status `invalid-url`;
the run continues with the remaining URLs.

### Output layout

One subfolder per post, named by shortcode. Carousel items are numbered
`_1.._N`; a single item gets no suffix. Filename conflicts are
uniquified, never overwritten.

```
downloads/
├── manifest.json
├── C7xKp2AbCdE/
│   ├── C7xKp2AbCdE_1.jpg
│   └── C7xKp2AbCdE_2.mp4
└── D8yLq3BcDeF/
    └── D8yLq3BcDeF.mp4
```

### Progress and exit code

One line per URL during the run, then a summary:

```
[3/12] C7xKp2AbCdE completed (2 files, gallery-dl)
...
Done in 41.3s: 9 completed, 1 skipped, 1 requires-login, 1 invalid-url — 14 files
```

Exit code is `0` only if every URL ended `completed`, `skipped`, or
`dry-run`; `1` otherwise.

## Limitations (v1)

- **No login/cookies.** Many posts — and most reels — are behind a
  login wall for anonymous clients; they end up as `requires-login`.
  The extractor interface already carries a seam for a future
  `--cookies <file>` flag.
- Only direct post/reel URLs: no stories, highlights, or profile
  scraping.
- No parallel downloads.
- Instagram only (the extractor registry keeps the door open for other
  sites).

## Development

```bash
pnpm test            # full Jest suite
pnpm test:unit       # unit tests only
pnpm test:coverage   # with coverage (90% thresholds)
pnpm lint            # ESLint
pnpm format          # Prettier write
pnpm validate        # lint + format check + tests + coverage
```

See [CLAUDE.md](CLAUDE.md) for architecture and testing details.

## License

MIT
