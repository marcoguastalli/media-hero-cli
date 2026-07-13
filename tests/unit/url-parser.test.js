import {
  classifyUrl,
  parseUrlsFile,
  URL_TYPES,
} from '../../src/input/url-parser.js';

describe('classifyUrl', () => {
  it('classifies a post URL and extracts the shortcode', () => {
    const result = classifyUrl('https://www.instagram.com/p/C7xKp2AbCdE/');
    expect(result).toEqual({
      url: 'https://www.instagram.com/p/C7xKp2AbCdE/',
      type: URL_TYPES.POST,
      shortcode: 'C7xKp2AbCdE',
    });
  });

  it('classifies a post URL with a username prefix', () => {
    const result = classifyUrl(
      'https://www.instagram.com/heroaccount/p/AB-12_cd/'
    );
    expect(result.type).toBe(URL_TYPES.POST);
    expect(result.shortcode).toBe('AB-12_cd');
  });

  it('classifies /reel/ and /reels/ URLs', () => {
    expect(classifyUrl('https://www.instagram.com/reel/XYZ789/').type).toBe(
      URL_TYPES.REEL
    );
    const reels = classifyUrl('https://instagram.com/reels/XYZ789/');
    expect(reels.type).toBe(URL_TYPES.REEL);
    expect(reels.shortcode).toBe('XYZ789');
  });

  it('rejects profile and non-post Instagram URLs', () => {
    expect(classifyUrl('https://www.instagram.com/heroaccount/').type).toBe(
      URL_TYPES.INVALID
    );
    expect(
      classifyUrl('https://www.instagram.com/stories/heroaccount/123/').type
    ).toBe(URL_TYPES.INVALID);
  });

  it('rejects non-Instagram hosts, including lookalikes', () => {
    expect(classifyUrl('https://example.com/p/ABC/').type).toBe(
      URL_TYPES.INVALID
    );
    expect(classifyUrl('https://notinstagram.com/p/ABC/').type).toBe(
      URL_TYPES.INVALID
    );
  });

  it('rejects malformed URLs and non-http protocols', () => {
    expect(classifyUrl('not a url').type).toBe(URL_TYPES.INVALID);
    expect(classifyUrl('ftp://instagram.com/p/ABC/').type).toBe(
      URL_TYPES.INVALID
    );
  });
});

describe('parseUrlsFile', () => {
  it('skips blank lines and comments, classifies the rest', () => {
    const content = [
      '# my list',
      '',
      '  https://www.instagram.com/p/AAA111/  ',
      'https://www.instagram.com/heroaccount/',
      '\t',
      'https://www.instagram.com/reel/BBB222/',
    ].join('\n');

    const entries = parseUrlsFile(content);
    expect(entries).toHaveLength(3);
    expect(entries[0].shortcode).toBe('AAA111');
    expect(entries[1].type).toBe(URL_TYPES.INVALID);
    expect(entries[2].type).toBe(URL_TYPES.REEL);
  });

  it('handles CRLF line endings', () => {
    const entries = parseUrlsFile(
      'https://www.instagram.com/p/AAA111/\r\nhttps://www.instagram.com/p/BBB222/\r\n'
    );
    expect(entries.map(e => e.shortcode)).toEqual(['AAA111', 'BBB222']);
  });

  it('returns an empty list for empty content', () => {
    expect(parseUrlsFile('')).toEqual([]);
    expect(parseUrlsFile('# only comments\n')).toEqual([]);
  });
});
