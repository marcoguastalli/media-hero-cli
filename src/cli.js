#!/usr/bin/env node
/**
 * CLI entry point: argument parsing and default wiring of the real
 * extractors, queue, and reporter. Kept thin — all logic lives in
 * app.js and is covered by tests; this file is excluded from coverage.
 */

import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { runApp } from './app.js';
import { CONFIG } from './config.js';
import { DownloadQueue } from './download/queue.js';
import { createGalleryDlExtractor } from './extractors/gallery-dl.js';
import { createImginnExtractor } from './extractors/imginn.js';
import { createPlaywrightExtractor } from './extractors/playwright-extractor.js';
import { createExtractorChain } from './extractors/registry.js';
import { Reporter } from './report/reporter.js';

const HELP = `Usage: media-hero-cli [urls.txt] [options]

Download Instagram post/reel media listed in a text file (one URL per
line; blank lines and lines starting with # are ignored). The input file
defaults to ${CONFIG.input.defaultFile} when omitted.

Options:
  --out DIR       Output directory (default: ${CONFIG.output.defaultDir})
  --delay MS      Delay between URLs in ms (default: ${CONFIG.batch.defaultDelayMs})
  --cookies FILE  Netscape cookies.txt with a logged-in Instagram
                  session (for posts behind the login wall)
  --force         Re-download URLs already marked completed
  --dry-run       Only parse and classify; no network access, no writes
  --verbose       Per-step logging (extractor attempts, retries)
  --help          Show this help
  --version       Show version

Without --cookies only public content is reachable: posts behind
Instagram's login wall are reported with a distinct "requires-login"
status. Install gallery-dl for the primary extractor (pip install
gallery-dl); without it the Playwright fallback is used
(npx playwright install firefox).`;

const parseCliArgs = () =>
  parseArgs({
    options: {
      out: { type: 'string', default: CONFIG.output.defaultDir },
      delay: { type: 'string' },
      cookies: { type: 'string' },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      version: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

const main = async () => {
  const { values, positionals } = parseCliArgs();
  const reporter = new Reporter({ verbose: values.verbose });

  if (values.help) {
    reporter.info(HELP);
    return 0;
  }
  if (values.version) {
    const require = createRequire(import.meta.url);
    reporter.info(require('../package.json').version);
    return 0;
  }
  if (positionals.length > 1) {
    console.error('Expected at most one input file.\n');
    console.error(HELP);
    return 1;
  }
  const urlsFile = positionals[0] ?? CONFIG.input.defaultFile;

  const chain = createExtractorChain(
    [
      createGalleryDlExtractor(),
      createPlaywrightExtractor(),
      createImginnExtractor(),
    ],
    { onWarning: message => reporter.warn(message) }
  );

  const { exitCode } = await runApp(
    {
      urlsFile,
      outDir: values.out,
      delayMs: values.delay === undefined ? undefined : Number(values.delay),
      force: values.force,
      dryRun: values['dry-run'],
      cookiesFile: values.cookies,
    },
    { chain, queue: new DownloadQueue(), reporter }
  );

  return exitCode;
};

main().then(
  code => {
    process.exitCode = code;
  },
  error => {
    console.error(error.message);
    process.exitCode = 1;
  }
);
