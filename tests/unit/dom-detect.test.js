/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectImginnMedia,
  detectInstagramMedia,
  hasLoginForm,
} from '../../src/extractors/dom-detect.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/dom'
);
const loadFixture = name => {
  document.body.innerHTML = readFileSync(path.join(fixturesDir, name), 'utf8');
};

describe('detectInstagramMedia', () => {
  it('picks the highest-resolution srcset candidate and skips profile pictures', () => {
    loadFixture('single-image.html');
    const media = detectInstagramMedia(10);

    expect(media).toEqual([
      { url: 'https://cdn.example.com/photo_1440.jpg', type: 'image' },
    ]);
  });

  it('detects carousel items, deduplicates, and prioritizes videos', () => {
    loadFixture('carousel.html');
    const media = detectInstagramMedia(10);

    expect(media).toEqual([
      { url: 'https://cdn.example.com/slide2.mp4', type: 'video' },
      { url: 'https://cdn.example.com/slide1_1080.jpg', type: 'image' },
      { url: 'https://cdn.example.com/slide3_1080.jpg', type: 'image' },
    ]);
  });

  it('caps results at maxItems', () => {
    loadFixture('carousel.html');
    expect(detectInstagramMedia(2)).toHaveLength(2);
  });

  it('detects a reel video via its <source> child outside an article', () => {
    loadFixture('reel.html');
    const media = detectInstagramMedia(10);

    expect(media).toEqual([
      { url: 'https://cdn.example.com/reel_720.mp4', type: 'video' },
    ]);
  });

  it('finds nothing on a login wall', () => {
    loadFixture('login-wall.html');
    expect(detectInstagramMedia(10)).toEqual([]);
  });

  it('filters small UI images and falls back from srcset to src', () => {
    document.body.innerHTML = `
      <article>
        <video></video>
        <img srcset="" src="https://cdn.example.com/fallback.jpg" alt="Photo" />
        <img srcset="" />
        <img srcset="https://cdn.example.com/nosize.jpg" alt="Photo" />
        <img id="icon" srcset="https://cdn.example.com/icon_64.jpg 64w" alt="Photo" />
        <img id="large" srcset="https://cdn.example.com/large_1080.jpg 1080w" alt="Photo" />
      </article>`;
    // jsdom reports zero-sized rects; give the size filter real widths
    document.getElementById('icon').getBoundingClientRect = () => ({
      width: 64,
    });
    document.getElementById('large').getBoundingClientRect = () => ({
      width: 480,
    });

    expect(detectInstagramMedia(10)).toEqual([
      { url: 'https://cdn.example.com/fallback.jpg', type: 'image' },
      { url: 'https://cdn.example.com/nosize.jpg', type: 'image' },
      { url: 'https://cdn.example.com/large_1080.jpg', type: 'image' },
    ]);
  });
});

describe('detectImginnMedia', () => {
  // imginn proxy URL shape: <proxy-host>/<file>?<cdn-path>?<cdn-query>,
  // where the cdn-query carries the original host in _nc_ht.
  const proxy = (file, host) =>
    `https://s6.imginn.com/${file}?t51/${file}?stp=x&_nc_ht=${host}&oh=1`;
  const direct = (file, host) =>
    `https://${host}/v/t51/${file}?stp=x&_nc_ht=${host}&oh=1`;

  it('reconstructs direct cdninstagram URLs, using data-src for lazy slides', () => {
    const host = 'scontent-atl3-2.cdninstagram.com';
    document.body.innerHTML = `
      <div class="show">
        <div class="media-wrap"><img src="${proxy('a_n.jpg', host)}" /></div>
        <div class="media-wrap">
          <img class="lazy" src="//assets.imginn.com/img/lazy.jpg"
               data-src="${proxy('b_n.jpg', host)}" />
        </div>
      </div>
      <div class="comments">
        <div class="media-wrap"><img src="${proxy('avatar_n.jpg', host)}" /></div>
      </div>`;

    expect(detectImginnMedia(10)).toEqual([
      { url: direct('a_n.jpg', host), type: 'image' },
      { url: direct('b_n.jpg', host), type: 'image' },
      { url: direct('avatar_n.jpg', host), type: 'image' },
    ]);
  });

  it('prefers a video inside a media-wrap and caps at maxItems', () => {
    const host = 'scontent.cdninstagram.com';
    document.body.innerHTML = `
      <div class="media-wrap">
        <video><source src="${proxy('clip_n.mp4', host)}" /></video>
        <img src="${proxy('poster_n.jpg', host)}" />
      </div>
      <div class="media-wrap"><img src="${proxy('c_n.jpg', host)}" /></div>`;

    expect(detectImginnMedia(1)).toEqual([
      { url: direct('clip_n.mp4', host), type: 'video' },
    ]);
  });

  it('passes through already-direct URLs and skips unreconstructable ones', () => {
    const host = 'scontent.cdninstagram.com';
    document.body.innerHTML = `
      <div class="media-wrap"><img src="https://${host}/v/direct.jpg" /></div>
      <div class="media-wrap"><img src="https://s6.imginn.com/broken.jpg" /></div>`;

    expect(detectImginnMedia(10)).toEqual([
      { url: `https://${host}/v/direct.jpg`, type: 'image' },
    ]);
  });

  it('returns nothing when there are no media-wrap containers', () => {
    document.body.innerHTML = '<div class="page-post"></div>';
    expect(detectImginnMedia(10)).toEqual([]);
  });
});

describe('hasLoginForm', () => {
  it('detects the login wall', () => {
    loadFixture('login-wall.html');
    expect(hasLoginForm()).toBe(true);
  });

  it('is false on a regular post page', () => {
    loadFixture('single-image.html');
    expect(hasLoginForm()).toBe(false);
  });
});
