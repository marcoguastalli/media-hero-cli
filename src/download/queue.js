/**
 * Sequential download queue with retry and exponential backoff,
 * ported from the media-hero-catch extension's download-queue.js
 * (browser.downloads replaced with fetch + file streaming).
 */

import { createWriteStream } from 'node:fs';
import { access, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CONFIG } from '../config.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const exists = filePath =>
  access(filePath).then(
    () => true,
    () => false
  );

export class DownloadQueue {
  constructor({
    fetchFn = globalThis.fetch,
    retryAttempts = CONFIG.downloads.retryAttempts,
    retryDelays = CONFIG.downloads.retryDelays,
    fileTimeoutMs = CONFIG.downloads.fileTimeoutMs,
    sleepFn = sleep,
  } = {}) {
    this.fetchFn = fetchFn;
    this.retryAttempts = retryAttempts;
    this.retryDelays = retryDelays;
    this.fileTimeoutMs = fileTimeoutMs;
    this.sleepFn = sleepFn;
  }

  /**
   * Download all media items sequentially into destDir.
   * @param {Array<{url, type, filename}>} mediaItems
   * @param {string} destDir - Destination directory
   * @returns {Promise<Array<{media, status, filePath?, error?}>>}
   */
  async downloadAll(mediaItems, destDir) {
    await mkdir(destDir, { recursive: true });
    const results = [];

    for (const media of mediaItems) {
      try {
        const filePath = await this.downloadWithRetry(media, destDir);
        results.push({ media, status: 'completed', filePath });
      } catch (error) {
        results.push({ media, status: 'failed', error: error.message });
      }
    }

    return results;
  }

  async downloadWithRetry(media, destDir) {
    let lastError;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.downloadFile(media.url, destDir, media.filename);
      } catch (error) {
        lastError = error;
        if (attempt < this.retryAttempts) {
          await this.sleepFn(this.retryDelays[attempt] ?? 2000);
        }
      }
    }

    throw lastError;
  }

  async downloadFile(url, destDir, filename) {
    const filePath = await uniquePath(destDir, filename);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fileTimeoutMs);

    try {
      const response = await this.fetchFn(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      if (!response.body) {
        throw new Error(`Empty response body for ${url}`);
      }
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(filePath)
      );
      return filePath;
    } catch (error) {
      await unlink(filePath).catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Resolve a non-clobbering path inside destDir: if the filename is
 * taken, append _1, _2, ... before the extension.
 */
async function uniquePath(destDir, filename) {
  const { name, ext } = path.parse(filename);
  let candidate = path.join(destDir, filename);
  let counter = 1;

  while (await exists(candidate)) {
    candidate = path.join(destDir, `${name}_${counter}${ext}`);
    counter++;
  }

  return candidate;
}

/**
 * Verify that files written by an external tool exist and are non-empty.
 * @param {string[]} filePaths
 * @returns {Promise<string[]>} The same paths, if all valid
 */
export async function verifyFiles(filePaths) {
  for (const filePath of filePaths) {
    const info = await stat(filePath).catch(() => null);
    if (!info || info.size === 0) {
      throw new Error(`Missing or empty downloaded file: ${filePath}`);
    }
  }
  return filePaths;
}
