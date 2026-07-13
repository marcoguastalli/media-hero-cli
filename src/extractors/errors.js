/**
 * Typed errors shared by all extractors.
 */

export const ERROR_CODES = {
  REQUIRES_LOGIN: 'requires-login',
  NOT_FOUND: 'not-found',
  TOOL_MISSING: 'tool-missing',
  EXTRACTION_FAILED: 'extraction-failed',
};

export class ExtractorError extends Error {
  /**
   * @param {string} code - One of ERROR_CODES
   * @param {string} message - Human-readable description
   */
  constructor(code, message) {
    super(message);
    this.name = 'ExtractorError';
    this.code = code;
  }
}

/**
 * Check whether an error is an ExtractorError with the given code.
 * @param {Error} error
 * @param {string} code - One of ERROR_CODES
 * @returns {boolean}
 */
export const hasErrorCode = (error, code) =>
  error instanceof ExtractorError && error.code === code;
