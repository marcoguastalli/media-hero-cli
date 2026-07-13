/**
 * Last-resort extractor: imginn.com, a public Instagram mirror keyed
 * by the same shortcode (https://imginn.com/p/<shortcode>/). It shows
 * login-walled posts anonymously, which is why the chain may reach it
 * after a requires-login from the Instagram extractors.
 *
 * The site sits behind a Cloudflare JS challenge, so it must be loaded
 * in a real headless browser; the challenge resolves itself after a
 * few seconds. Media URLs are reconstructed to the original
 * cdninstagram form (see detectImginnMedia), which the download queue
 * can fetch without a browser.
 */

import { CONFIG } from '../config.js';
import { detectImginnMedia } from './dom-detect.js';
import { ERROR_CODES, ExtractorError } from './errors.js';

const CHALLENGE_TITLE = /just a moment|attention required/i;

const defaultLaunch = async () => {
  const { firefox } = await import('playwright');
  return firefox.launch({ headless: true });
};

export function createImginnExtractor({ launchFn = defaultLaunch } = {}) {
  return {
    name: 'imginn',

    async extract(url, { shortcode }) {
      const browser = await launchFn();
      try {
        return await extractFromPage(browser, shortcode, url);
      } finally {
        await browser.close().catch(() => {});
      }
    },
  };
}

async function extractFromPage(browser, shortcode, sourceUrl) {
  const page = await browser.newPage();

  await page.goto(`${CONFIG.imginn.baseUrl}/p/${shortcode}/`, {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.instagram.pageTimeoutMs,
  });
  await passCloudflareChallenge(page);

  const media = await page.evaluate(
    detectImginnMedia,
    CONFIG.instagram.maxCarouselItems
  );

  if (media.length === 0) {
    throw new ExtractorError(
      ERROR_CODES.EXTRACTION_FAILED,
      `imginn has no media for ${sourceUrl}`
    );
  }

  return { media };
}

async function passCloudflareChallenge(page) {
  const { challengeAttempts, challengeDelayMs } = CONFIG.imginn;

  for (let attempt = 0; attempt < challengeAttempts; attempt++) {
    if (!CHALLENGE_TITLE.test(await page.title())) {
      return;
    }
    await page.waitForTimeout(challengeDelayMs);
  }

  throw new ExtractorError(
    ERROR_CODES.EXTRACTION_FAILED,
    'imginn Cloudflare challenge did not clear'
  );
}
