/**
 * Extractor chain: tries each extractor in order until one succeeds.
 *
 * Every extractor implements:
 *   { name: string, extract(url, options) → Promise<{media, directDownload?}> }
 *
 * A 'requires-login' error falls through like any other (a mirror such
 * as imginn may still succeed anonymously), but it is remembered and
 * wins over later errors when every extractor fails — the login wall is
 * the root cause worth reporting.
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
      let loginError = null;

      for (const extractor of extractors) {
        try {
          const result = await extractor.extract(url, options);
          return { ...result, extractor: extractor.name };
        } catch (error) {
          if (hasErrorCode(error, ERROR_CODES.REQUIRES_LOGIN)) {
            loginError = error;
          } else if (hasErrorCode(error, ERROR_CODES.TOOL_MISSING)) {
            warnOnce(extractor, error);
          }
          lastError = error;
        }
      }

      throw (
        loginError ??
        lastError ??
        new ExtractorError(
          ERROR_CODES.EXTRACTION_FAILED,
          'No extractors configured'
        )
      );
    },
  };
}
