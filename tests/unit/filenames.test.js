import {
  buildFilenames,
  guessExtension,
  mediaTypeFromFilename,
} from '../../src/download/filenames.js';

describe('guessExtension', () => {
  it('always stores images as jpg, whatever the URL says', () => {
    expect(guessExtension('https://cdn.example.com/a.png?x=1')).toBe('jpg');
    expect(guessExtension('https://cdn.example.com/a.webp')).toBe('jpg');
    expect(guessExtension('https://cdn.example.com/a.heic', 'image')).toBe(
      'jpg'
    );
    expect(guessExtension(null)).toBe('jpg');
  });

  it('detects known video extensions in URLs', () => {
    expect(guessExtension('https://cdn.example.com/v.mp4', 'video')).toBe(
      'mp4'
    );
    expect(guessExtension('https://cdn.example.com/v.webm?x=1', 'video')).toBe(
      'webm'
    );
  });

  it('falls back to mp4 for opaque or missing video URLs', () => {
    expect(guessExtension('https://cdn.example.com/opaque', 'video')).toBe(
      'mp4'
    );
    expect(guessExtension(null, 'video')).toBe('mp4');
  });
});

describe('mediaTypeFromFilename', () => {
  it('classifies by extension', () => {
    expect(mediaTypeFromFilename('clip.mp4')).toBe('video');
    expect(mediaTypeFromFilename('/tmp/out/clip.WEBM')).toBe('video');
    expect(mediaTypeFromFilename('photo.jpg')).toBe('image');
    expect(mediaTypeFromFilename('unknown')).toBe('image');
    expect(mediaTypeFromFilename(null)).toBe('image');
  });
});

describe('buildFilenames', () => {
  it('gives a single item no numbering suffix', () => {
    const named = buildFilenames(
      [{ url: 'https://cdn.example.com/a.jpg', type: 'image' }],
      'ABC123'
    );
    expect(named).toHaveLength(1);
    expect(named[0].filename).toBe('ABC123.jpg');
  });

  it('numbers carousel items with a zero-padded 3-digit suffix', () => {
    const named = buildFilenames(
      [
        { url: 'https://cdn.example.com/a.jpg', type: 'image' },
        { url: 'https://cdn.example.com/b.mp4', type: 'video' },
      ],
      'ABC123'
    );
    expect(named.map(item => item.filename)).toEqual([
      'ABC123_001.jpg',
      'ABC123_002.mp4',
    ]);
  });
});
