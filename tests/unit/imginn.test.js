import { detectImginnMedia } from '../../src/extractors/dom-detect.js';
import { ERROR_CODES } from '../../src/extractors/errors.js';
import { createImginnExtractor } from '../../src/extractors/imginn.js';

const SHORTCODE = 'ABC123';
const SOURCE_URL = 'https://www.instagram.com/p/ABC123/';

/**
 * Fake browser whose page reports a scripted title sequence (to model
 * the Cloudflare challenge clearing) and returns scripted media from
 * the detectImginnMedia evaluate call.
 */
const makeFakeBrowser = ({
  media = [{ url: 'https://cdn.example.com/a.jpg', type: 'image' }],
  titles = ['imginn'],
  gotoUrls = [],
} = {}) => {
  const state = { closed: false, titleCall: 0 };
  const page = {
    goto: async url => {
      gotoUrls.push(url);
    },
    title: async () => titles[Math.min(state.titleCall++, titles.length - 1)],
    waitForTimeout: async () => {},
    evaluate: async fn => {
      if (fn === detectImginnMedia) {
        return media;
      }
      throw new Error('Unexpected evaluate call');
    },
  };
  const browser = {
    newPage: async () => page,
    close: async () => {
      state.closed = true;
    },
  };
  return { browser, state, gotoUrls };
};

const makeExtractor = fake =>
  createImginnExtractor({ launchFn: async () => fake.browser });

describe('imginn extractor', () => {
  it('loads the shortcode mirror page and returns its media', async () => {
    const media = [{ url: 'https://cdn.example.com/a.jpg', type: 'image' }];
    const fake = makeFakeBrowser({ media });

    const result = await makeExtractor(fake).extract(SOURCE_URL, {
      shortcode: SHORTCODE,
    });

    expect(result.media).toEqual(media);
    expect(fake.gotoUrls).toEqual(['https://imginn.com/p/ABC123/']);
    expect(fake.state.closed).toBe(true);
  });

  it('waits for the Cloudflare challenge to clear before extracting', async () => {
    const fake = makeFakeBrowser({
      titles: ['Just a moment...', 'Just a moment...', 'Linux DevOps (@x)'],
    });

    const result = await makeExtractor(fake).extract(SOURCE_URL, {
      shortcode: SHORTCODE,
    });
    expect(result.media).toHaveLength(1);
  });

  it('fails when the challenge never clears', async () => {
    const fake = makeFakeBrowser({ titles: ['Just a moment...'] });

    await expect(
      makeExtractor(fake).extract(SOURCE_URL, { shortcode: SHORTCODE })
    ).rejects.toMatchObject({ code: ERROR_CODES.EXTRACTION_FAILED });
    expect(fake.state.closed).toBe(true);
  });

  it('fails when the mirror page has no media', async () => {
    const fake = makeFakeBrowser({ media: [] });

    await expect(
      makeExtractor(fake).extract(SOURCE_URL, { shortcode: SHORTCODE })
    ).rejects.toMatchObject({ code: ERROR_CODES.EXTRACTION_FAILED });
  });

  it('exposes the imginn name with the default launcher', () => {
    expect(createImginnExtractor().name).toBe('imginn');
  });
});
