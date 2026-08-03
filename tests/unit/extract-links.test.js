import { extractPostLinks } from '../../src/collection/extract-links.js';

describe('extractPostLinks', () => {
  it('extracts unique post links from anchor hrefs', () => {
    const html = `
      <a href="/p/AAA111/" role="link">...</a>
      <a href="/p/BBB222/" role="link">...</a>
      <a href="/p/AAA111/" role="link">...</a>
    `;

    const links = extractPostLinks(html);
    expect(links).toEqual([
      {
        shortcode: 'AAA111',
        type: 'post',
        url: 'https://www.instagram.com/p/AAA111/',
      },
      {
        shortcode: 'BBB222',
        type: 'post',
        url: 'https://www.instagram.com/p/BBB222/',
      },
    ]);
  });

  it('extracts /reel/ and /reels/ links as type reel', () => {
    const html = `
      <a href="/reel/CCC333/">...</a>
      <a href="/reels/DDD444/">...</a>
    `;

    const links = extractPostLinks(html);
    expect(links).toEqual([
      {
        shortcode: 'CCC333',
        type: 'reel',
        url: 'https://www.instagram.com/reel/CCC333/',
      },
      {
        shortcode: 'DDD444',
        type: 'reel',
        url: 'https://www.instagram.com/reel/DDD444/',
      },
    ]);
  });

  it('ignores non post/reel hrefs, e.g. profile links', () => {
    const html = `
      <a href="/heroaccount/">Profile</a>
      <a href="/p/EEE555/">Post</a>
      <a href="/explore/tags/x/">Tag</a>
    `;

    expect(extractPostLinks(html).map(l => l.shortcode)).toEqual(['EEE555']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(extractPostLinks('<div>no links here</div>')).toEqual([]);
    expect(extractPostLinks('')).toEqual([]);
  });

  it('parses a real saved-collection HTML fragment', () => {
    const html = `<div class="_ac7v"><a href="/p/DaZ_7T1jAM0/" role="link" tabindex="0"><img alt="Photo"></a></div>
      <div class="_ac7v"><a href="/p/DaLSJ9PjQ8C/" role="link" tabindex="0"><img alt="Photo"></a></div>
      <div class="_ac7v"><a href="/p/DaKc7EHDJzs/" role="link" tabindex="0"><img alt="Photo"></a></div>`;

    expect(extractPostLinks(html).map(l => l.shortcode)).toEqual([
      'DaZ_7T1jAM0',
      'DaLSJ9PjQ8C',
      'DaKc7EHDJzs',
    ]);
  });

  it('extracts links from a plain URL list (harvest script clipboard output)', () => {
    const text = [
      'https://www.instagram.com/reels/',
      'https://www.instagram.com/p/DbJO2-4oICF/',
      'https://www.instagram.com/reel/DaKc7EHDJzs/',
      'https://www.instagram.com/p/DbJO2-4oICF/',
    ].join('\n');

    expect(extractPostLinks(text)).toEqual([
      {
        shortcode: 'DbJO2-4oICF',
        type: 'post',
        url: 'https://www.instagram.com/p/DbJO2-4oICF/',
      },
      {
        shortcode: 'DaKc7EHDJzs',
        type: 'reel',
        url: 'https://www.instagram.com/reel/DaKc7EHDJzs/',
      },
    ]);
  });
});
