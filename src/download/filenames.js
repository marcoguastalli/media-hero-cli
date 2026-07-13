/**
 * Filename helpers: extension guessing and carousel numbering.
 *
 * Numbering convention: a single item gets no suffix; carousel items
 * get a zero-padded 3-digit suffix _001.._NNN (diverges from the
 * media-hero-catch extension's un-padded _1.._N).
 */

import path from 'node:path';

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];
const CAROUSEL_PAD = 3;

/**
 * Pick a file extension for a media URL. Images are always stored as
 * .jpg regardless of the source URL (CDNs serve the same photo as
 * jpg/webp/heic interchangeably); only video extensions are guessed.
 * @param {string} url - Media URL
 * @param {string} type - 'image' or 'video'
 * @returns {string} Extension without dot
 */
export function guessExtension(url, type = 'image') {
  if (type !== 'video') {
    return 'jpg';
  }

  const lower = String(url || '').toLowerCase();
  for (const ext of VIDEO_EXTENSIONS) {
    if (lower.includes(`.${ext}`)) {
      return ext;
    }
  }

  return 'mp4';
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

  return media.map((item, index) => {
    const suffix = String(index + 1).padStart(CAROUSEL_PAD, '0');
    return {
      ...item,
      filename: `${shortcode}_${suffix}.${guessExtension(item.url, item.type)}`,
    };
  });
}
