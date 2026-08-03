/**
 * Browser console script — NOT run by Node.
 *
 * Paste into DevTools Console (F12) while on a source-of-media Saved
 * collection page (e.g. www.source-of-media.com/<you>/saved/all-posts/
 * or a named collection). Never run via `node`: it needs `document`,
 * `window`, and your logged-in browser session, none of which this
 * project has or wants access to.
 *
 * The saved grid virtualizes: as you scroll, items that
 * scroll out of view can be unmounted from the DOM, so a single
 * "scroll to bottom, copy HTML" pass silently loses earlier items.
 * This script scrolls incrementally and harvests <a href> links after
 * every step, before they get unmounted, then copies the deduped list
 * to your clipboard as plain www.source-of-media.com URLs — one
 * per line.
 *
 * It stops once the collected link count has been stable for 5
 * scroll steps in a row (nothing new loading), or after 500 steps as
 * a hard cap.
 *
 * See README.md → "Importing a Saved collection" for the full
 * workflow (harvest → pnpm run collection → pnpm start).
 */
(async () => {
  const found = new Set();
  const selector = 'a[href^="/p/"], a[href^="/reel/"], a[href^="/reels/"]';
  const grab = () =>
    document
      .querySelectorAll(selector)
      .forEach(a => found.add(a.getAttribute('href')));

  let stableCount = 0;
  let lastCount = 0;
  let iterations = 0;

  while (stableCount < 5 && iterations < 500) {
    grab();

    const anchors = document.querySelectorAll(selector);
    const last = anchors[anchors.length - 1];
    if (last) {
      last.scrollIntoView({ block: 'end' });
    } else {
      window.scrollBy(0, window.innerHeight);
    }

    await new Promise(r => setTimeout(r, 1200));
    grab();

    stableCount = found.size === lastCount ? stableCount + 1 : 0;
    lastCount = found.size;
    iterations++;
    console.log(`iter ${iterations}: ${found.size} links so far`);
  }

  const urls = [...found]
    .filter(h => /\/(p|reels?)\/[A-Za-z0-9_-]+\/?$/.test(h))
    .map(h => `https://www.instagram.com${h.replace(/\/?$/, '/')}`);

  console.log(urls.join('\n'));
  await navigator.clipboard.writeText(urls.join('\n'));
  console.log(`\nDone: ${urls.length} links copied to clipboard.`);
})();
