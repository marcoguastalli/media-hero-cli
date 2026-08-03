/**
 * Turn a saved-collection HTML page into an updated urls.txt: extract
 * links, drop anything already downloaded (per manifest.json, verified
 * against disk) or already present in the current urls.txt, and also
 * prune any *existing* urls.txt lines that turn out to already be
 * downloaded — so completed posts never linger in the file and spam
 * "skipped (already downloaded)" on the next `pnpm start` run. Blank
 * lines, comments, and invalid/non-matching lines are left untouched.
 */

import { isAlreadyDownloaded } from '../app.js';
import { extractPostLinks } from './extract-links.js';
import { classifyUrl, parseUrlsFile } from '../input/url-parser.js';

/**
 * Filter existing urls.txt lines, dropping any that are already
 * downloaded. Comments, blank lines, and invalid/non-matching lines
 * pass through untouched. Mutates `listedShortcodes` in place,
 * removing pruned shortcodes so they're treated as new if re-harvested.
 */
async function pruneExistingLines({
  existingUrlsContent,
  manifest,
  outDir,
  isAlreadyDownloadedFn,
  listedShortcodes,
}) {
  const keptExistingLines = [];
  let pruned = 0;

  for (const rawLine of existingUrlsContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const { shortcode } = classifyUrl(line);
    const downloaded =
      shortcode && (await isAlreadyDownloadedFn(manifest, shortcode, outDir));
    if (downloaded) {
      listedShortcodes.delete(shortcode);
      pruned++;
      continue;
    }
    keptExistingLines.push(line);
  }

  return { keptExistingLines, pruned };
}

/**
 * @param {Object} options
 * @param {string} options.html - Raw collection page HTML, or a plain URL list
 * @param {string} [options.existingUrlsContent] - Current urls.txt content
 * @param {Object} options.manifest - Loaded Manifest instance
 * @param {string} options.outDir - Download output directory (for on-disk checks)
 * @param {Function} [options.isAlreadyDownloadedFn] - Injected for testing
 * @returns {Promise<{
 *   newUrls: string[],
 *   keptExistingLines: string[],
 *   stats: {found: number, downloaded: number, listed: number, added: number, pruned: number}
 * }>}
 */
export async function buildCollectionUrls({
  html,
  existingUrlsContent = '',
  manifest,
  outDir,
  isAlreadyDownloadedFn = isAlreadyDownloaded,
}) {
  const listedShortcodes = new Set(
    parseUrlsFile(existingUrlsContent)
      .map(entry => entry.shortcode)
      .filter(Boolean)
  );

  const { keptExistingLines, pruned } = await pruneExistingLines({
    existingUrlsContent,
    manifest,
    outDir,
    isAlreadyDownloadedFn,
    listedShortcodes,
  });

  const links = extractPostLinks(html);
  const newUrls = [];
  let downloaded = 0;
  let listed = 0;

  for (const link of links) {
    if (await isAlreadyDownloadedFn(manifest, link.shortcode, outDir)) {
      downloaded++;
      continue;
    }
    if (listedShortcodes.has(link.shortcode)) {
      listed++;
      continue;
    }
    listedShortcodes.add(link.shortcode);
    newUrls.push(link.url);
  }

  return {
    newUrls,
    keptExistingLines,
    stats: {
      found: links.length,
      downloaded,
      listed,
      added: newUrls.length,
      pruned,
    },
  };
}
