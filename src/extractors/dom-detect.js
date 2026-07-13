/**
 * DOM detection functions executed in the browser context via
 * page.evaluate(). Each function must be fully self-contained
 * (no imports, no closure references) because Playwright serializes
 * it into the page.
 *
 * The heuristics mirror the media-hero-catch extension's Instagram
 * detector: prefer <video> sources, pick the highest-resolution srcset
 * candidate for images, and filter out profile pictures and tiny UI
 * elements.
 */

/**
 * Detect post media on an Instagram page.
 * @param {number} maxItems - Carousel cap
 * @returns {Array<{url: string, type: string}>}
 */
export function detectInstagramMedia(maxItems) {
  const results = [];
  const seen = new Set();
  const scope = document.querySelector('article') || document.body;

  const bestFromSrcset = srcset =>
    srcset
      .split(',')
      .map(part => {
        const [url, size] = part.trim().split(/\s+/);
        return { url, width: parseInt(size, 10) || 0 };
      })
      .sort((a, b) => b.width - a.width)[0]?.url || null;

  const push = (url, type) => {
    if (url && url.startsWith('http') && !seen.has(url)) {
      seen.add(url);
      results.push({ url, type });
    }
  };

  const videoUrl = video =>
    video.src || video.querySelector('source')?.src || null;

  const isUiImage = img => {
    const alt = (img.alt || '').toLowerCase();
    if (alt.includes('profile picture')) {
      return true;
    }
    const rect = img.getBoundingClientRect();
    return rect.width > 0 && rect.width < 200;
  };

  for (const video of scope.querySelectorAll('video')) {
    push(videoUrl(video), 'video');
  }

  for (const img of scope.querySelectorAll('img[srcset]')) {
    if (!isUiImage(img)) {
      push(bestFromSrcset(img.srcset) || img.src || null, 'image');
    }
  }

  return results.slice(0, maxItems);
}

/**
 * Detect post media on an imginn.com mirror page.
 *
 * imginn proxies Instagram's CDN behind Cloudflare
 * (`https://sN.imginn.com/<file>?<cdn-path>?<cdn-query>`), but the
 * original cdninstagram URL — including its valid signature — can be
 * reconstructed from the proxy URL, and that one is fetchable without
 * a browser. Post media (and nothing else: profile pictures, related
 * posts, and comment avatars live elsewhere) sits inside `.media-wrap`
 * containers; lazy-loaded slides keep the real URL in `data-src`.
 * @param {number} maxItems - Carousel cap
 * @returns {Array<{url: string, type: string}>}
 */
export function detectImginnMedia(maxItems) {
  const results = [];
  const seen = new Set();

  const toDirectUrl = value => {
    const rest = value.slice(value.indexOf('?') + 1);
    const query = rest.slice(rest.indexOf('?') + 1);
    const host = new URLSearchParams(query).get('_nc_ht');
    return host && rest !== value ? `https://${host}/v/${rest}` : null;
  };

  const push = (rawUrl, type) => {
    if (!rawUrl || results.length >= maxItems) {
      return;
    }
    const url = /\bimginn\.com\//.test(rawUrl) ? toDirectUrl(rawUrl) : rawUrl;
    if (url && url.startsWith('http') && !seen.has(url)) {
      seen.add(url);
      results.push({ url, type });
    }
  };

  const sourceOf = el =>
    el.getAttribute('data-src') ||
    el.getAttribute('src') ||
    el.querySelector('source')?.getAttribute('src') ||
    null;

  for (const wrap of document.querySelectorAll('.media-wrap')) {
    const video = wrap.querySelector('video');
    const img = wrap.querySelector('img');
    if (video) {
      push(sourceOf(video), 'video');
    } else if (img) {
      push(sourceOf(img), 'image');
    }
  }

  return results;
}

/**
 * Detect Instagram's anonymous login wall.
 * @returns {boolean}
 */
export function hasLoginForm() {
  return Boolean(
    document.querySelector(
      'input[name="username"], form[id*="login"], form[action*="login"]'
    )
  );
}
