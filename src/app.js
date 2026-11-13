/**
 * Pipeline orchestrator: parse input → (per URL) skip/extract/download →
 * record in manifest → report. All side-effectful collaborators are
 * injected, so the whole pipeline is testable without network or
 * external tools.
 */

import {
  access,
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, validateDelay } from './config.js';
import { buildFilenames } from './download/filenames.js';
import { verifyFiles } from './download/queue.js';
import { ERROR_CODES, hasErrorCode } from './extractors/errors.js';
import { parseUrlsFile, URL_TYPES } from './input/url-parser.js';
import { Manifest } from './manifest/manifest.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const OK_STATUSES = new Set(['completed', 'skipped', 'dry-run']);

/** Statuses after which the inter-URL rate-limiting delay applies. */
const NETWORK_STATUSES = new Set(['completed', 'failed', 'requires-login']);

/** Unsuccessful statuses whose empty destination folder is cleaned up
 * and whose URL is recorded in urls_fails.txt for a later retry. */
const FAIL_TRACKED_STATUSES = new Set(['failed', 'requires-login']);

/**
 * Run the full pipeline.
 * @param {Object} options - { urlsFile, outDir, delayMs?, force?, dryRun?,
 *   cookiesFile?, cookiesFromBrowser? }
 * @param {Object} deps - { chain, queue, reporter, sleepFn? }
 * @returns {Promise<{exitCode: number, results: Array}>}
 */
export async function runApp(options, deps) {
  const { urlsFile, outDir, force = false, dryRun = false } = options;
  const { cookiesFile, cookiesFromBrowser } = await resolveCookies(options);
  const { chain, queue, reporter, sleepFn = sleep } = deps;
  const delayMs = validateDelay(options.delayMs ?? CONFIG.batch.defaultDelayMs);

  const entries = parseUrlsFile(await readFile(urlsFile, 'utf8'));
  const manifest = await new Manifest(outDir).load();
  const failTracker = await createFailTracker(urlsFile);
  const startedAt = Date.now();
  const results = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ctx = {
      entry,
      manifest,
      chain,
      queue,
      outDir,
      force,
      dryRun,
      cookiesFile,
      cookiesFromBrowser,
    };
    const result = await processEntry(ctx, reporter);
    if (FAIL_TRACKED_STATUSES.has(result.status)) {
      await failTracker.record(outDir, result.key, entry.url);
    }
    results.push(result);
    reporter.progress(
      i + 1,
      entries.length,
      result.key,
      result.status,
      describeResult(result)
    );

    const isLast = i === entries.length - 1;
    if (!isLast && !dryRun && NETWORK_STATUSES.has(result.status)) {
      await sleepFn(delayMs);
    }
  }

  reporter.summary(results, Date.now() - startedAt);
  const exitCode = results.every(r => OK_STATUSES.has(r.status)) ? 0 : 1;
  return { exitCode, results };
}

/**
 * Normalize the session options, failing fast on a missing cookies file.
 * @returns {Promise<{cookiesFile: string|null, cookiesFromBrowser: string|null}>}
 */
async function resolveCookies(options) {
  const cookiesFile = options.cookiesFile ?? null;
  const cookiesFromBrowser = options.cookiesFromBrowser ?? null;

  if (cookiesFile) {
    await access(cookiesFile).catch(() => {
      throw new Error(`Cookies file not found: ${cookiesFile}`);
    });
  }
  return { cookiesFile, cookiesFromBrowser };
}

async function processEntry(ctx, reporter) {
  const { entry, manifest, force, dryRun, outDir } = ctx;
  const key = entry.shortcode ?? entry.url;

  if (entry.type === URL_TYPES.INVALID) {
    const error = 'Not a recognized post/reel URL';
    if (!dryRun) {
      await manifest.record(key, {
        url: entry.url,
        status: 'invalid-url',
        files: [],
        error,
      });
    }
    return { key, status: 'invalid-url', files: [], error };
  }

  if (!force && (await shouldSkipExisting(manifest, key, outDir))) {
    return { key, status: 'skipped', files: [] };
  }

  if (dryRun) {
    return { key, status: 'dry-run', files: [] };
  }

  try {
    const { files, extractor } = await extractAndDownload(ctx, key);
    await manifest.record(key, {
      url: entry.url,
      status: 'completed',
      files,
      extractor,
    });
    return { key, status: 'completed', files, extractor };
  } catch (error) {
    const status = hasErrorCode(error, ERROR_CODES.REQUIRES_LOGIN)
      ? 'requires-login'
      : 'failed';
    reporter.debug(error.stack ?? error.message);
    await manifest.record(key, {
      url: entry.url,
      status,
      files: [],
      error: error.message,
    });
    return { key, status, files: [], error: error.message };
  }
}

async function extractAndDownload(ctx, key) {
  const { entry, chain, queue, outDir } = ctx;
  const { cookiesFile, cookiesFromBrowser } = ctx;
  const destDir = path.join(outDir, key);
  await mkdir(destDir, { recursive: true });

  const result = await chain.extract(entry.url, {
    destDir,
    shortcode: key,
    cookiesFile,
    cookiesFromBrowser,
  });

  if (result.directDownload?.length) {
    await verifyFiles(result.directDownload);
    return {
      files: result.directDownload.map(file => path.relative(outDir, file)),
      extractor: result.extractor,
    };
  }

  const named = buildFilenames(result.media, key);
  const downloads = await queue.downloadAll(named, destDir);
  const failed = downloads.filter(d => d.status === 'failed');
  if (failed.length > 0) {
    throw new Error(
      `${failed.length}/${downloads.length} files failed: ${failed[0].error}`
    );
  }

  return {
    files: downloads.map(d => path.relative(outDir, d.filePath)),
    extractor: result.extractor,
  };
}

/**
 * True when a key should be skipped rather than (re-)extracted: either
 * the manifest says completed with the recorded files still on disk, or
 * the destination folder already has files the manifest never recorded
 * (e.g. left behind by a prior crashed/interrupted run, or an extractor
 * that partially wrote output before falling through to a fallback) —
 * re-extracting into it would otherwise duplicate what's already there.
 * @returns {Promise<boolean>}
 */
async function shouldSkipExisting(manifest, key, outDir) {
  if (await isAlreadyDownloaded(manifest, key, outDir)) {
    return true;
  }
  const entries = await readdir(path.join(outDir, key)).catch(() => []);
  return entries.length > 0;
}

/**
 * True when a key is recorded completed in the manifest and all of its
 * files are still present on disk — the condition for skipping it.
 * @returns {Promise<boolean>}
 */
export async function isAlreadyDownloaded(manifest, key, outDir) {
  if (!manifest.isCompleted(key)) {
    return false;
  }
  const recorded = manifest.getEntry(key)?.files ?? [];
  return allFilesPresent(recorded, outDir);
}

/**
 * True only if every manifest-recorded file for a completed entry is
 * still on disk. An empty record (nothing to verify) counts as absent,
 * so such an entry is re-downloaded rather than blindly skipped.
 * @param {string[]} relFiles - Paths relative to outDir
 * @param {string} outDir
 * @returns {Promise<boolean>}
 */
async function allFilesPresent(relFiles, outDir) {
  if (relFiles.length === 0) {
    return false;
  }
  for (const rel of relFiles) {
    const present = await access(path.join(outDir, rel)).then(
      () => true,
      () => false
    );
    if (!present) {
      return false;
    }
  }
  return true;
}

/**
 * Tracks unsuccessful downloads (failed or requires-login): on each one
 * it removes the (possibly partial or empty) destination folder and
 * appends the URL to urls_fails.txt (next to urlsFile), deduping
 * against entries already recorded there.
 * @returns {Promise<{record(outDir: string, key: string, url: string): Promise<void>}>}
 */
async function createFailTracker(urlsFile) {
  const failsFile = path.join(path.dirname(urlsFile), 'urls_fails.txt');
  const content = await readFile(failsFile, 'utf8').catch(() => '');
  const knownFails = new Set(
    content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  );

  return {
    async record(outDir, key, url) {
      await rm(path.join(outDir, key), { recursive: true, force: true });
      if (!knownFails.has(url)) {
        knownFails.add(url);
        await appendFile(failsFile, `${url}\n`);
      }
    },
  };
}

function describeResult(result) {
  if (result.status === 'completed') {
    return `${result.files.length} files, ${result.extractor}`;
  }
  if (result.status === 'skipped') {
    return 'already downloaded';
  }
  return result.error ?? '';
}
