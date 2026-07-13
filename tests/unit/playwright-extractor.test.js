import {
  detectInstagramMedia,
  hasLoginForm,
} from '../../src/extractors/dom-detect.js';
import { ERROR_CODES } from '../../src/extractors/errors.js';
import { createPlaywrightExtractor } from '../../src/extractors/playwright-extractor.js';

const POST_URL = 'https://www.instagram.com/p/ABC123/';

/**
 * Build a fake browser whose page behavior is scripted per test.
 * `evaluate` dispatches on the serialized function identity, mirroring
 * how the extractor calls page.evaluate.
 */
const makeFakeBrowser = ({
  media = [],
  finalUrl = POST_URL,
  articleAppears = true,
  loginFormPresent = false,
  gotoError = null,
  closeError = null,
  loginCheckError = null,
} = {}) => {
  const state = { closed: false, cookies: null };
  const page = {
    goto: async () => {
      if (gotoError) {
        throw gotoError;
      }
    },
    context: () => ({
      addCookies: async cookies => {
        state.cookies = cookies;
      },
    }),
    url: () => finalUrl,
    waitForSelector: async () => {
      if (!articleAppears) {
        throw new Error('Timeout waiting for selector "article"');
      }
    },
    evaluate: async fn => {
      if (fn === detectInstagramMedia) {
        return media;
      }
      if (fn === hasLoginForm) {
        if (loginCheckError) {
          throw loginCheckError;
        }
        return loginFormPresent;
      }
      throw new Error('Unexpected evaluate call');
    },
  };
  const browser = {
    newPage: async () => page,
    close: async () => {
      state.closed = true;
      if (closeError) {
        throw closeError;
      }
    },
  };
  return { browser, state };
};

const makeExtractor = fake =>
  createPlaywrightExtractor({ launchFn: async () => fake.browser });

describe('playwright extractor', () => {
  it('returns detected media from the page', async () => {
    const media = [
      { url: 'https://cdn.example.com/a_1080.jpg', type: 'image' },
      { url: 'https://cdn.example.com/b.mp4', type: 'video' },
    ];
    const fake = makeFakeBrowser({ media });

    const result = await makeExtractor(fake).extract(POST_URL);
    expect(result.media).toEqual(media);
    expect(fake.state.closed).toBe(true);
  });

  it('throws requires-login on redirect to the login page', async () => {
    const fake = makeFakeBrowser({
      finalUrl:
        'https://www.instagram.com/accounts/login/?next=%2Fp%2FABC123%2F',
    });

    await expect(makeExtractor(fake).extract(POST_URL)).rejects.toMatchObject({
      code: ERROR_CODES.REQUIRES_LOGIN,
    });
    expect(fake.state.closed).toBe(true);
  });

  it('throws requires-login when no article appears but a login form does', async () => {
    const fake = makeFakeBrowser({
      articleAppears: false,
      loginFormPresent: true,
    });

    await expect(makeExtractor(fake).extract(POST_URL)).rejects.toMatchObject({
      code: ERROR_CODES.REQUIRES_LOGIN,
    });
  });

  it('throws extraction-failed when no article and no login form appear', async () => {
    const fake = makeFakeBrowser({ articleAppears: false });

    await expect(makeExtractor(fake).extract(POST_URL)).rejects.toMatchObject({
      code: ERROR_CODES.EXTRACTION_FAILED,
    });
  });

  it('throws extraction-failed when the page has no media', async () => {
    const fake = makeFakeBrowser({ media: [] });

    await expect(makeExtractor(fake).extract(POST_URL)).rejects.toMatchObject({
      code: ERROR_CODES.EXTRACTION_FAILED,
    });
  });

  it('closes the browser even when navigation fails', async () => {
    const fake = makeFakeBrowser({ gotoError: new Error('net::ERR_FAILED') });

    await expect(makeExtractor(fake).extract(POST_URL)).rejects.toThrow(
      'net::ERR_FAILED'
    );
    expect(fake.state.closed).toBe(true);
  });

  it('exposes the playwright name with the default launcher', () => {
    expect(createPlaywrightExtractor().name).toBe('playwright');
  });

  it('ignores failures while closing the browser', async () => {
    const media = [
      { url: 'https://cdn.example.com/a_1080.jpg', type: 'image' },
    ];
    const fake = makeFakeBrowser({
      media,
      closeError: new Error('browser already closed'),
    });

    const result = await makeExtractor(fake).extract(POST_URL);
    expect(result.media).toEqual(media);
    expect(fake.state.closed).toBe(true);
  });

  it('loads cookies from a Netscape file into the browser context', async () => {
    const media = [
      { url: 'https://cdn.example.com/a_1080.jpg', type: 'image' },
    ];
    const fake = makeFakeBrowser({ media });
    const readCalls = [];
    const extractor = createPlaywrightExtractor({
      launchFn: async () => fake.browser,
      readFileFn: async (file, encoding) => {
        readCalls.push({ file, encoding });
        return '.instagram.com\tTRUE\t/\tTRUE\t1790000000\tsessionid\ts3cret';
      },
    });

    const result = await extractor.extract(POST_URL, {
      cookiesFile: '/tmp/cookies.txt',
    });

    expect(result.media).toEqual(media);
    expect(readCalls).toEqual([{ file: '/tmp/cookies.txt', encoding: 'utf8' }]);
    expect(fake.state.cookies).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 's3cret' }),
    ]);
  });

  it('does not touch the browser context without a cookies file', async () => {
    const fake = makeFakeBrowser({
      media: [{ url: 'https://cdn.example.com/a.jpg', type: 'image' }],
    });

    await makeExtractor(fake).extract(POST_URL);
    expect(fake.state.cookies).toBeNull();
  });

  it('treats a failing login-wall check as no login wall', async () => {
    const fake = makeFakeBrowser({
      articleAppears: false,
      loginCheckError: new Error('execution context destroyed'),
    });

    await expect(makeExtractor(fake).extract(POST_URL)).rejects.toMatchObject({
      code: ERROR_CODES.EXTRACTION_FAILED,
    });
  });
});
