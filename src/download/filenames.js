/**
 * Filename helpers: extension guessing and carousel numbering.
 *
 * Numbering convention matches the media-hero-catch extension:
 * a single item gets no suffix, carousel items get _1.._N.
 */

import path from 'node:path';

const IMAGE_EXTENSIONS = ['png', 'gif', 'webp', 'svg', 'jpeg', 'jpg'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];

/**
 * Guess a file extension from a media URL.
 * @param {string} url - Media URL
 * @param {string} type - 'image' or 'video'
 * @returns {string} Extension without dot
 */
export function guessExtension(url, type = 'image') {
  const lower = String(url || '').toLowerCase();

  for (const ext of [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]) {
    if (lower.includes(`.${ext}`)) {
      return ext;
    }
  }

  return type === 'video' ? 'mp4' : 'jpg';
}

/**
 * Classify a file as image or video by its extension.
 * @param {string} filename - File name or path
 * @returns {string} 'video' or 'image'
 */
export function mediaTypeFromFilename(filename) {
  const ext = path
    .extname(String(filename || ''))
    .slice(1)
    .toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'image';
}

/**
 * Assign shortcode-based filenames to extracted media.
 * @param {Array<{url: string, type: string}>} media - Extracted media
 * @param {string} shortcode - Post shortcode
 * @returns {Array} Media items with a `filename` property
 */
export function buildFilenames(media, shortcode) {
  if (media.length === 1) {
    const item = media[0];
    return [
      {
        ...item,
        filename: `${shortcode}.${guessExtension(item.url, item.type)}`,
      },
    ];
  }

  return media.map((item, index) => ({
    ...item,
    filename: `${shortcode}_${index + 1}.${guessExtension(item.url, item.type)}`,
  }));
}
