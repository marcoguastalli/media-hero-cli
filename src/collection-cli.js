#!/usr/bin/env node
/**
 * CLI entry point for turning a saved source-of-media collection page
 * into urls.txt entries. Kept thin — logic lives in
 * collection/build-urls.js and is covered by tests; this file is
 * excluded from coverage.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { buildCollectionUrls } from './collection/build-urls.js';
import { CONFIG } from './config.js';
import { Manifest } from './manifest/manifest.js';
import { Reporter } from './report/reporter.js';

const HELP = `Usage: media-hero-cli-collection <collection.html> [options]

Extract post/reel links from either a saved-collection page's
HTML (save it to a file first, e.g. via "Copy as HTML" or View Source)
or a plain list of www.source-of-media.com URLs (e.g. clipboard output
pasted into a file from scripts/harvest-saved-links.js — see README.md), and
merge new ones into urls.txt. Links already marked completed in
manifest.json (and still on disk), or already present in urls.txt, are
skipped.

Options:
  --out DIR        Output/manifest directory (default: ${CONFIG.output.defaultDir})
  --urls-file FILE Target urls.txt file (default: ${CONFIG.input.defaultFile})
  --help           Show this help`;

const parseCliArgs = () =>
  parseArgs({
    options: {
      out: { type: 'string', default: CONFIG.output.defaultDir },
      'urls-file': { type: 'string', default: CONFIG.input.defaultFile },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

const writeUrlsFile = async (urlsFile, keptExistingLines, newUrls) => {
  const lines = [...keptExistingLines, ...newUrls];
  await writeFile(urlsFile, lines.map(url => `${url}\n`).join(''));
};

const main = async () => {
  const { values, positionals } = parseCliArgs();
  const reporter = new Reporter();

  if (values.help) {
    reporter.info(HELP);
    return 0;
  }
  if (positionals.length !== 1) {
    console.error('Expected exactly one collection HTML file.\n');
    console.error(HELP);
    return 1;
  }

  const [htmlFile] = positionals;
  const outDir = values.out;
  const urlsFile = values['urls-file'];

  const html = await readFile(htmlFile, 'utf8');
  const existingContent = await readFile(urlsFile, 'utf8').catch(() => '');
  const manifest = await new Manifest(outDir).load();

  const { newUrls, keptExistingLines, stats } = await buildCollectionUrls({
    html,
    existingUrlsContent: existingContent,
    manifest,
    outDir,
  });

  if (newUrls.length > 0 || stats.pruned > 0) {
    await writeUrlsFile(urlsFile, keptExistingLines, newUrls);
  }

  reporter.info(
    `Found ${stats.found} link(s): ${stats.downloaded} already downloaded, ` +
      `${stats.listed} already in ${urlsFile}, ${stats.added} added, ` +
      `${stats.pruned} pruned from ${urlsFile} (already downloaded).`
  );

  return 0;
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
