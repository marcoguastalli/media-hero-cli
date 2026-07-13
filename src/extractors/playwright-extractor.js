/**
 * Fallback extractor: loads the post in a headless browser and applies
 * DOM-based detection (see dom-detect.js), like the media-hero-catch
 * extension does in its content script.
 *
 * Returns media URLs only — the download queue fetches the files.
 */

import { CONFIG } from '../config.js';
import { detectInstagramMedia, hasLoginForm } from './dom-detect.js';
import { ERROR_CODES, ExtractorError } from './errors.js';

const defaultLaunch = async () => {
  const { firefox } = await import('playwright');
  return firefox.launch({ headless: true });
};

export function createPlaywrightExtractor({ launchFn = defaultLaunch } = {}) {
  return {
    name: 'playwright',

    async extract(url) {
      const browser = await launchFn();
      try {
        return await extractFromPage(browser, url);
      } finally {
        await browser.close().catch(() => {});
      }
    },
  };
}

async function extractFromPage(browser, url) {
  const page = await browser.newPage();
  const timeout = CONFIG.instagram.pageTimeoutMs;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

  if (page.url().includes('/accounts/login')) {
    throw new ExtractorError(
      ERROR_CODES.REQUIRES_LOGIN,
      `Redirected to login page for ${url}`
    );
  }

  await waitForPostContent(page, url, timeout);

  const media = await page.evaluate(
    detectInstagramMedia,
    CONFIG.instagram.maxCarouselItems
  );

  if (media.length === 0) {
    throw new ExtractorError(
      ERROR_CODES.EXTRACTION_FAILED,
      `No media found on ${url}`
    );
  }

  return { media };
}

async function waitForPostContent(page, url, timeout) {
  try {
    await page.waitForSelector('article', { timeout });
  } catch {
    const loginWall = await page.evaluate(hasLoginForm).catch(() => false);
    if (loginWall) {
      throw new ExtractorError(
        ERROR_CODES.REQUIRES_LOGIN,
        `Login wall shown for ${url}`
      );
    }
    throw new ExtractorError(
      ERROR_CODES.EXTRACTION_FAILED,
      `No post content found on ${url}`
    );
  }
}
