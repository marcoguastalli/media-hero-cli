import { ERROR_CODES, ExtractorError } from '../../src/extractors/errors.js';
import { createExtractorChain } from '../../src/extractors/registry.js';

const succeeding = name => ({
  name,
  extract: async () => ({ media: [{ url: 'https://cdn.example.com/a.jpg' }] }),
});

const failing = (name, code) => ({
  name,
  extract: async () => {
    throw new ExtractorError(code, `${name} says ${code}`);
  },
});

describe('createExtractorChain', () => {
  it('returns the first successful result tagged with the extractor name', async () => {
    const chain = createExtractorChain([succeeding('one'), succeeding('two')]);
    const result = await chain.extract('https://url', {});
    expect(result.extractor).toBe('one');
    expect(result.media).toHaveLength(1);
  });

  it('falls through to the next extractor on failure', async () => {
    const chain = createExtractorChain([
      failing('one', ERROR_CODES.EXTRACTION_FAILED),
      succeeding('two'),
    ]);
    const result = await chain.extract('https://url', {});
    expect(result.extractor).toBe('two');
  });

  it('still tries later extractors after a requires-login', async () => {
    let fallbackCalled = false;
    const chain = createExtractorChain([
      failing('one', ERROR_CODES.REQUIRES_LOGIN),
      {
        name: 'imginn',
        extract: async () => {
          fallbackCalled = true;
          return { media: [{ url: 'https://cdn.example.com/a.jpg' }] };
        },
      },
    ]);

    const result = await chain.extract('https://url', {});
    expect(result.extractor).toBe('imginn');
    expect(fallbackCalled).toBe(true);
  });

  it('reports requires-login in preference to later errors when all fail', async () => {
    const chain = createExtractorChain([
      failing('gallery-dl', ERROR_CODES.REQUIRES_LOGIN),
      failing('imginn', ERROR_CODES.EXTRACTION_FAILED),
    ]);

    await expect(chain.extract('https://url', {})).rejects.toMatchObject({
      code: ERROR_CODES.REQUIRES_LOGIN,
    });
  });

  it('warns once (per extractor) when its tool is missing', async () => {
    const warnings = [];
    const chain = createExtractorChain(
      [failing('one', ERROR_CODES.TOOL_MISSING), succeeding('two')],
      { onWarning: message => warnings.push(message) }
    );

    await chain.extract('https://url/1', {});
    await chain.extract('https://url/2', {});
    expect(warnings).toEqual(['one says tool-missing']);
  });

  it('stays silent about missing tools when no warning handler is given', async () => {
    const chain = createExtractorChain([
      failing('one', ERROR_CODES.TOOL_MISSING),
      succeeding('two'),
    ]);
    const result = await chain.extract('https://url', {});
    expect(result.extractor).toBe('two');
  });

  it('throws the last error when every extractor fails', async () => {
    const chain = createExtractorChain([
      failing('one', ERROR_CODES.EXTRACTION_FAILED),
      failing('two', ERROR_CODES.NOT_FOUND),
    ]);
    await expect(chain.extract('https://url', {})).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it('throws when no extractors are configured', async () => {
    const chain = createExtractorChain([]);
    await expect(chain.extract('https://url', {})).rejects.toThrow(
      'No extractors configured'
    );
  });
});
