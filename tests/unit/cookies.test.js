import { parseNetscapeCookies } from '../../src/extractors/cookies.js';

const FILE = [
  '# Netscape HTTP Cookie File',
  '# https://curl.se/docs/http-cookies.html',
  '',
  '.instagram.com\tTRUE\t/\tTRUE\t1790000000\tcsrftoken\tabc123',
  '#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t1790000000\tsessionid\ts3cret',
  '.instagram.com\tTRUE\t/\tFALSE\t0\tig_lang\ten',
  'not a cookie line',
  '.instagram.com\tTRUE\t/\tTRUE\t1790000000\ttoo\tmany\tfields',
].join('\n');

describe('parseNetscapeCookies', () => {
  it('parses regular cookie lines into addCookies shape', () => {
    const cookies = parseNetscapeCookies(FILE);

    expect(cookies[0]).toEqual({
      name: 'csrftoken',
      value: 'abc123',
      domain: '.instagram.com',
      path: '/',
      expires: 1790000000,
      secure: true,
      httpOnly: false,
    });
  });

  it('treats #HttpOnly_ lines as cookies, not comments', () => {
    const cookies = parseNetscapeCookies(FILE);
    const session = cookies.find(c => c.name === 'sessionid');

    expect(session).toMatchObject({
      value: 's3cret',
      domain: '.instagram.com',
      httpOnly: true,
    });
  });

  it('maps expiry 0 (session cookie) and FALSE secure flag', () => {
    const cookies = parseNetscapeCookies(FILE);
    const lang = cookies.find(c => c.name === 'ig_lang');

    expect(lang).toMatchObject({ expires: -1, secure: false });
  });

  it('skips comments, blank lines, and malformed lines', () => {
    expect(parseNetscapeCookies(FILE)).toHaveLength(3);
  });

  it('returns an empty array for empty input', () => {
    expect(parseNetscapeCookies('')).toEqual([]);
  });
});
