/**
 * Manifest: JSON state file in the output directory that records the
 * status of every processed URL, enabling resume/skip across runs.
 * Written incrementally (after each URL) so an interrupted run loses
 * nothing.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';

export class Manifest {
  constructor(outDir) {
    this.filePath = path.join(outDir, CONFIG.output.manifestName);
    this.data = { version: 1, entries: {} };
  }

  /**
   * Load existing manifest from disk; a missing or unreadable file
   * yields a fresh manifest.
   * @returns {Promise<Manifest>} this
   */
  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.entries === 'object') {
        this.data = parsed;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(
          `Ignoring unreadable manifest ${this.filePath}: ${error.message}`
        );
      }
    }
    return this;
  }

  getEntry(key) {
    return this.data.entries[key];
  }

  isCompleted(key) {
    return this.getEntry(key)?.status === 'completed';
  }

  /**
   * Record an entry and persist the manifest to disk.
   * @param {string} key - Shortcode (or raw URL for invalid entries)
   * @param {Object} entry - { url, status, files, extractor?, error? }
   */
  async record(key, entry) {
    this.data.entries[key] = { ...entry, timestamp: new Date().toISOString() };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}
