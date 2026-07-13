import { CONFIG, validateDelay } from '../../src/config.js';

describe('config', () => {
  it('exposes the expected sections', () => {
    expect(CONFIG.batch.defaultDelayMs).toBeGreaterThan(0);
    expect(CONFIG.downloads.retryDelays).toHaveLength(
      CONFIG.downloads.retryAttempts
    );
    expect(CONFIG.instagram.maxCarouselItems).toBe(10);
    expect(CONFIG.output.manifestName).toBe('manifest.json');
  });

  describe('validateDelay', () => {
    it('returns the default for non-numeric input', () => {
      expect(validateDelay(undefined)).toBe(CONFIG.batch.defaultDelayMs);
      expect(validateDelay('fast')).toBe(CONFIG.batch.defaultDelayMs);
      expect(validateDelay(NaN)).toBe(CONFIG.batch.defaultDelayMs);
    });

    it('clamps values into the allowed range', () => {
      expect(validateDelay(-5)).toBe(CONFIG.batch.minDelayMs);
      expect(validateDelay(999999)).toBe(CONFIG.batch.maxDelayMs);
    });

    it('passes through valid values', () => {
      expect(validateDelay(1500)).toBe(1500);
      expect(validateDelay(0)).toBe(0);
    });
  });
});
