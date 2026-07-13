import {
  ERROR_CODES,
  ExtractorError,
  hasErrorCode,
} from '../../src/extractors/errors.js';

describe('ExtractorError', () => {
  it('carries a code and message', () => {
    const error = new ExtractorError(ERROR_CODES.NOT_FOUND, 'gone');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ExtractorError');
    expect(error.code).toBe('not-found');
    expect(error.message).toBe('gone');
  });
});

describe('hasErrorCode', () => {
  it('matches only ExtractorError instances with the given code', () => {
    const login = new ExtractorError(ERROR_CODES.REQUIRES_LOGIN, 'wall');
    expect(hasErrorCode(login, ERROR_CODES.REQUIRES_LOGIN)).toBe(true);
    expect(hasErrorCode(login, ERROR_CODES.NOT_FOUND)).toBe(false);
    expect(hasErrorCode(new Error('plain'), ERROR_CODES.REQUIRES_LOGIN)).toBe(
      false
    );
  });
});
