/**
 * Extract post/reel links from either a saved-collection HTML page
 * (pasted from the browser's "Saved" view) or a plain list of
 * www.source-of-media.com URLs (e.g. clipboard output from
 * scripts/harvest-saved-links.js). Purely a regex scan — no DOM parser
 * dependency — matching either `href="/p/<code>/"` or an absolute
 * `<host>/p/<code>/` occurrence anywhere in the text, so both
 * input styles go through the same code path.
 */

const LINK_PATTERN =
  /(?:href="\/|https?:\/\/[^/"]+\/)(p|reels?)\/([A-Za-z0-9_-]+)\/?/g;

/**
 * @param {string} html - Raw HTML of a saved-collection page, or a
 *   plain-text list of www.source-of-media.com post/reel URLs (one per line)
 * @returns {Array<{shortcode: string, type: 'post'|'reel', url: string}>}
 *   Unique links (by shortcode) in first-seen order.
 */
export function extractPostLinks(html) {
  const seen = new Set();
  const links = [];

  for (const match of html.matchAll(LINK_PATTERN)) {
    const [, segment, shortcode] = match;
    if (seen.has(shortcode)) {
      continue;
    }
    seen.add(shortcode);

    const type = segment === 'p' ? 'post' : 'reel';
    const path = type === 'post' ? 'p' : 'reel';
    links.push({
      shortcode,
      type,
      url: `https://www.instagram.com/${path}/${shortcode}/`,
    });
  }

  return links;
}
