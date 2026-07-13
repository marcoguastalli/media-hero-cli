/**
 * Input file parsing and Instagram URL classification.
 *
 * Supported URL shapes:
 * - https://www.instagram.com/p/<shortcode>/          (post)
 * - https://www.instagram.com/<user>/p/<shortcode>/   (post)
 * - https://www.instagram.com/reel/<shortcode>/       (reel)
 * - https://www.instagram.com/reels/<shortcode>/      (reel)
 *
 * Everything else (profiles, stories, other hosts) is classified invalid.
 */

export const URL_TYPES = {
  POST: 'post',
  REEL: 'reel',
  INVALID: 'invalid',
};

const POST_PATTERN = /(?:^|\/)p\/([A-Za-z0-9_-]+)/;
const REEL_PATTERN = /(?:^|\/)reels?\/([A-Za-z0-9_-]+)/;

const invalid = url => ({ url, type: URL_TYPES.INVALID, shortcode: null });

/**
 * Classify a single URL and extract its shortcode.
 * @param {string} rawUrl - URL string from the input file
 * @returns {{url: string, type: string, shortcode: string|null}}
 */
export function classifyUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return invalid(rawUrl);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isInstagram =
    hostname === 'instagram.com' || hostname.endsWith('.instagram.com');
  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';

  if (!isInstagram || !isHttp) {
    return invalid(rawUrl);
  }

  const reelMatch = parsed.pathname.match(REEL_PATTERN);
  if (reelMatch) {
    return { url: rawUrl, type: URL_TYPES.REEL, shortcode: reelMatch[1] };
  }

  const postMatch = parsed.pathname.match(POST_PATTERN);
  if (postMatch) {
    return { url: rawUrl, type: URL_TYPES.POST, shortcode: postMatch[1] };
  }

  return invalid(rawUrl);
}

/**
 * Parse the content of a urls.txt file.
 * Blank lines and lines starting with '#' are ignored.
 * @param {string} content - Raw file content
 * @returns {Array<{url: string, type: string, shortcode: string|null}>}
 */
export function parseUrlsFile(content) {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(classifyUrl);
}
