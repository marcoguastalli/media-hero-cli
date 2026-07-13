/**
 * Netscape cookies.txt parsing — the format written by browser
 * "export cookies" extensions and consumed by gallery-dl/yt-dlp.
 *
 * gallery-dl takes the file path directly (--cookies); Playwright
 * needs cookie objects, so the file is parsed here into the shape
 * expected by BrowserContext.addCookies().
 */

const HTTPONLY_PREFIX = '#HttpOnly_';
const FIELD_COUNT = 7;

/**
 * Parse Netscape cookie file text.
 * Lines: domain \t includeSubdomains \t path \t secure \t expiry \t name \t value.
 * Comment lines start with '#' except the '#HttpOnly_' domain prefix;
 * malformed lines are skipped. Expiry 0 means a session cookie, which
 * Playwright expresses as -1.
 * @param {string} text - Raw cookies.txt content
 * @returns {Array<Object>} Cookies for BrowserContext.addCookies()
 */
export function parseNetscapeCookies(text) {
  const cookies = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const httpOnly = line.startsWith(HTTPONLY_PREFIX);
    if (line.length === 0 || (line.startsWith('#') && !httpOnly)) {
      continue;
    }

    const fields = (httpOnly ? line.slice(HTTPONLY_PREFIX.length) : line).split(
      '\t'
    );
    if (fields.length !== FIELD_COUNT) {
      continue;
    }

    const [domain, , path, secure, expires, name, value] = fields;
    cookies.push({
      name,
      value,
      domain,
      path,
      expires: Number(expires) || -1,
      secure: secure.toUpperCase() === 'TRUE',
      httpOnly,
    });
  }

  return cookies;
}
