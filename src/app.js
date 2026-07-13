/**
 * Pipeline orchestrator: parse input → (per URL) skip/extract/download →
 * record in manifest → report. All side-effectful collaborators are
 * injected, so the whole pipeline is testable without network or
 * external tools.
 */

import { access, mkdir, readFile } from 'node:fs/promises';
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

/**
 * Run the full pipeline.
 * @param {Object} options - { urlsFile, outDir, delayMs?, force?, dryRun?, cookiesFile? }
 * @param {Object} deps - { chain, queue, reporter, sleepFn? }
 * @returns {Promise<{exitCode: number, results: Array}>}
 */
export async function runApp(options, deps) {
  const { urlsFile, outDir, force = false, dryRun = false } = options;
  const cookiesFile = options.cookiesFile ?? null;
  const { chain, queue, reporter, sleepFn = sleep } = deps;
  const delayMs = validateDelay(options.delayMs ?? CONFIG.batch.defaultDelayMs);

  if (cookiesFile) {
    await access(cookiesFile).catch(() => {
      throw new Error(`Cookies file not found: ${cookiesFile}`);
    });
  }

  const entries = parseUrlsFile(await readFile(urlsFile, 'utf8'));
  const manifest = await new Manifest(outDir).load();
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
    };
    const result = await processEntry(ctx, reporter);
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

async function processEntry(ctx, reporter) {
  const { entry, manifest, force, dryRun } = ctx;
  const key = entry.shortcode ?? entry.url;

  if (entry.type === URL_TYPES.INVALID) {
    const error = 'Not a recognized Instagram post/reel URL';
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

  if (!force && manifest.isCompleted(key)) {
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
  const { entry, chain, queue, outDir, cookiesFile } = ctx;
  const destDir = path.join(outDir, key);
  await mkdir(destDir, { recursive: true });

  const result = await chain.extract(entry.url, {
    destDir,
    shortcode: key,
    cookiesFile,
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

function describeResult(result) {
  if (result.status === 'completed') {
    return `${result.files.length} files, ${result.extractor}`;
  }
  if (result.status === 'skipped') {
    return 'already downloaded';
  }
  return result.error ?? '';
}
