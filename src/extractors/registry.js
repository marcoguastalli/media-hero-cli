/**
 * Extractor chain: tries each extractor in order until one succeeds.
 *
 * Every extractor implements:
 *   { name: string, extract(url, options) → Promise<{media, directDownload?}> }
 *
 * A 'requires-login' error is terminal — no anonymous extractor will do
 * better, so it propagates immediately without trying the next one.
 */

import { ERROR_CODES, ExtractorError, hasErrorCode } from './errors.js';

export function createExtractorChain(extractors, { onWarning } = {}) {
  const warnedTools = new Set();

  const warnOnce = (extractor, error) => {
    if (!warnedTools.has(extractor.name)) {
      warnedTools.add(extractor.name);
      if (onWarning) {
        onWarning(error.message);
      }
    }
  };

  return {
    async extract(url, options) {
      let lastError = null;

      for (const extractor of extractors) {
        try {
          const result = await extractor.extract(url, options);
          return { ...result, extractor: extractor.name };
        } catch (error) {
          if (hasErrorCode(error, ERROR_CODES.REQUIRES_LOGIN)) {
            throw error;
          }
          if (hasErrorCode(error, ERROR_CODES.TOOL_MISSING)) {
            warnOnce(extractor, error);
          }
          lastError = error;
        }
      }

      throw (
        lastError ??
        new ExtractorError(
          ERROR_CODES.EXTRACTION_FAILED,
          'No extractors configured'
        )
      );
    },
  };
}
