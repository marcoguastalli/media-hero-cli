/**
 * Primary extractor: wraps the external `gallery-dl` binary.
 *
 * gallery-dl downloads files itself (into the post's destination directory),
 * so this extractor returns `directDownload` paths parsed from its stdout
 * instead of media URLs for the download queue to fetch.
 */

import { spawn } from 'node:child_process';
import { CONFIG } from '../config.js';
import { mediaTypeFromFilename } from '../download/filenames.js';
import { ERROR_CODES, ExtractorError } from './errors.js';

const LOGIN_PATTERN = /login|authoriz|unauthorized|401|403|rate limit/i;
const NOT_FOUND_PATTERN = /404|not found|no results/i;
const FILE_LINE_PATTERN = /\.[a-z0-9]{2,4}$/i;

export function createGalleryDlExtractor({
  spawnFn = spawn,
  binary = 'gallery-dl',
} = {}) {
  return {
    name: 'gallery-dl',

    async extract(url, { destDir }) {
      const args = [
        '-D',
        destDir,
        '--range',
        `1-${CONFIG.instagram.maxCarouselItems}`,
        url,
      ];
      const { code, stdout, stderr, error } = await run(spawnFn, binary, args);

      if (error) {
        throw toSpawnError(binary, error);
      }
      if (code !== 0) {
        throw toExitError(url, code, `${stderr}\n${stdout}`);
      }

      const files = parseDownloadedFiles(stdout);
      if (files.length === 0) {
        throw new ExtractorError(
          ERROR_CODES.EXTRACTION_FAILED,
          `gallery-dl reported no downloaded files for ${url}`
        );
      }

      return {
        media: files.map(file => ({
          url,
          type: mediaTypeFromFilename(file),
          filename: file,
        })),
        directDownload: files,
      };
    },
  };
}

function run(spawnFn, binary, args) {
  return new Promise(resolve => {
    const child = spawnFn(binary, args);
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = result => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    child.stdout?.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => settle({ code: null, stdout, stderr, error }));
    child.on('close', code => settle({ code, stdout, stderr, error: null }));
  });
}

function toSpawnError(binary, error) {
  if (error.code === 'ENOENT') {
    return new ExtractorError(
      ERROR_CODES.TOOL_MISSING,
      `${binary} is not installed; falling back. Install it with: pip install gallery-dl`
    );
  }
  return new ExtractorError(
    ERROR_CODES.EXTRACTION_FAILED,
    `Failed to run ${binary}: ${error.message}`
  );
}

function toExitError(url, code, output) {
  if (LOGIN_PATTERN.test(output)) {
    return new ExtractorError(
      ERROR_CODES.REQUIRES_LOGIN,
      `gallery-dl: ${url} requires a logged-in session`
    );
  }
  if (NOT_FOUND_PATTERN.test(output)) {
    return new ExtractorError(
      ERROR_CODES.NOT_FOUND,
      `gallery-dl: ${url} not found`
    );
  }
  return new ExtractorError(
    ERROR_CODES.EXTRACTION_FAILED,
    `gallery-dl exited with code ${code} for ${url}`
  );
}

/**
 * Extract file paths from gallery-dl stdout: one path per line;
 * already-present files are prefixed with '# '.
 */
function parseDownloadedFiles(stdout) {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^#\s*/, ''))
    .filter(line => line.length > 0 && FILE_LINE_PATTERN.test(line));
}
