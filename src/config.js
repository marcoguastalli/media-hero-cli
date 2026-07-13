/**
 * Central configuration for media-hero-cli.
 */
export const CONFIG = {
  batch: {
    defaultDelayMs: 3000,
    minDelayMs: 0,
    maxDelayMs: 30000,
  },
  downloads: {
    retryAttempts: 3,
    retryDelays: [2000, 4000, 8000],
    fileTimeoutMs: 60000,
  },
  instagram: {
    maxCarouselItems: 10,
    pageTimeoutMs: 10000,
  },
  imginn: {
    baseUrl: 'https://imginn.com',
    challengeAttempts: 6,
    challengeDelayMs: 5000,
  },
  output: {
    defaultDir: './downloads',
    manifestName: 'manifest.json',
  },
};

/**
 * Clamp a delay value into the allowed range.
 * @param {number} delayMs - Delay in milliseconds
 * @returns {number} Valid delay value
 */
export const validateDelay = delayMs => {
  const { minDelayMs, maxDelayMs, defaultDelayMs } = CONFIG.batch;

  if (typeof delayMs !== 'number' || Number.isNaN(delayMs)) {
    return defaultDelayMs;
  }

  return Math.max(minDelayMs, Math.min(maxDelayMs, delayMs));
};
