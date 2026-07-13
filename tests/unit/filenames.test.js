import {
  buildFilenames,
  guessExtension,
  mediaTypeFromFilename,
} from '../../src/download/filenames.js';

describe('guessExtension', () => {
  it('detects known extensions in URLs', () => {
    expect(guessExtension('https://cdn.example.com/a.png?x=1')).toBe('png');
    expect(guessExtension('https://cdn.example.com/v.mp4')).toBe('mp4');
    expect(guessExtension('https://cdn.example.com/a.webp')).toBe('webp');
  });

  it('falls back by media type', () => {
    expect(guessExtension('https://cdn.example.com/opaque', 'image')).toBe(
      'jpg'
    );
    expect(guessExtension('https://cdn.example.com/opaque', 'video')).toBe(
      'mp4'
    );
    expect(guessExtension(null)).toBe('jpg');
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

  it('numbers carousel items _1.._N', () => {
    const named = buildFilenames(
      [
        { url: 'https://cdn.example.com/a.jpg', type: 'image' },
        { url: 'https://cdn.example.com/b.mp4', type: 'video' },
      ],
      'ABC123'
    );
    expect(named.map(item => item.filename)).toEqual([
      'ABC123_1.jpg',
      'ABC123_2.mp4',
    ]);
  });
});
