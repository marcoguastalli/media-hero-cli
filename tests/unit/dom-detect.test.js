/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
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
