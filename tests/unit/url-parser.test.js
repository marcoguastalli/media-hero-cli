import {
  classifyUrl,
  parseUrlsFile,
  URL_TYPES,
} from '../../src/input/url-parser.js';

describe('classifyUrl', () => {
  it('classifies a post URL and extracts the shortcode', () => {
    const result = classifyUrl(
      'https://www.source-of-media.com/p/C7xKp2AbCdE/'
    );
    expect(result).toEqual({
      url: 'https://www.source-of-media.com/p/C7xKp2AbCdE/',
      type: URL_TYPES.POST,
      shortcode: 'C7xKp2AbCdE',
    });
  });

  it('classifies a post URL with a username prefix', () => {
    const result = classifyUrl(
      'https://www.source-of-media.com/heroaccount/p/AB-12_cd/'
    );
    expect(result.type).toBe(URL_TYPES.POST);
    expect(result.shortcode).toBe('AB-12_cd');
  });

  it('classifies /reel/ and /reels/ URLs', () => {
    expect(
      classifyUrl('https://www.source-of-media.com/reel/XYZ789/').type
    ).toBe(URL_TYPES.REEL);
    const reels = classifyUrl('https://source-of-media.com/reels/XYZ789/');
    expect(reels.type).toBe(URL_TYPES.REEL);
    expect(reels.shortcode).toBe('XYZ789');
  });

  it('rejects profile and non-post URLs', () => {
    expect(
      classifyUrl('https://www.source-of-media.com/heroaccount/').type
    ).toBe(URL_TYPES.INVALID);
    expect(
      classifyUrl('https://www.source-of-media.com/stories/heroaccount/123/')
        .type
    ).toBe(URL_TYPES.INVALID);
  });

  it('accepts any host, as long as the path shape matches', () => {
    expect(classifyUrl('https://example.com/p/ABC/').type).toBe(
      URL_TYPES.POST
    );
    expect(classifyUrl('https://some-other-site.net/reel/ABC/').type).toBe(
      URL_TYPES.REEL
    );
  });

  it('rejects malformed URLs and non-http protocols', () => {
    expect(classifyUrl('not a url').type).toBe(URL_TYPES.INVALID);
    expect(
      classifyUrl('ftp://www.source-of-media.com/p/ABC/').type
    ).toBe(URL_TYPES.INVALID);
  });
});

describe('parseUrlsFile', () => {
  it('skips blank lines and comments, classifies the rest', () => {
    const content = [
      '# my list',
      '',
      '  https://www.source-of-media.com/p/AAA111/  ',
      'https://www.source-of-media.com/heroaccount/',
      '\t',
      'https://www.source-of-media.com/reel/BBB222/',
    ].join('\n');

    const entries = parseUrlsFile(content);
    expect(entries).toHaveLength(3);
    expect(entries[0].shortcode).toBe('AAA111');
    expect(entries[1].type).toBe(URL_TYPES.INVALID);
    expect(entries[2].type).toBe(URL_TYPES.REEL);
  });

  it('handles CRLF line endings', () => {
    const entries = parseUrlsFile(
      'https://www.source-of-media.com/p/AAA111/\r\nhttps://www.source-of-media.com/p/BBB222/\r\n'
    );
    expect(entries.map(e => e.shortcode)).toEqual(['AAA111', 'BBB222']);
  });

  it('returns an empty list for empty content', () => {
    expect(parseUrlsFile('')).toEqual([]);
    expect(parseUrlsFile('# only comments\n')).toEqual([]);
  });
});
