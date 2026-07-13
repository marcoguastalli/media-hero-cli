/**
 * Terminal progress lines and end-of-run summary.
 */

export const STATUSES = [
  'completed',
  'skipped',
  'failed',
  'requires-login',
  'invalid-url',
  'dry-run',
];

export class Reporter {
  constructor({ out = process.stdout, verbose = false } = {}) {
    this.out = out;
    this.verbose = verbose;
  }

  info(message) {
    this.out.write(`${message}\n`);
  }

  debug(message) {
    if (this.verbose) {
      this.info(message);
    }
  }

  warn(message) {
    console.warn(message);
  }

  /**
   * One line per processed URL: [3/12] C7xKp2 completed (2 files, gallery-dl)
   */
  progress(index, total, label, status, detail = '') {
    const suffix = detail ? ` (${detail})` : '';
    this.info(`[${index}/${total}] ${label} ${status}${suffix}`);
  }

  summary(results, elapsedMs) {
    const counts = {};
    let files = 0;

    for (const result of results) {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      files += result.files?.length ?? 0;
    }

    const parts = STATUSES.filter(status => counts[status]).map(
      status => `${counts[status]} ${status}`
    );
    const seconds = (elapsedMs / 1000).toFixed(1);
    const fileLabel = files === 1 ? 'file' : 'files';

    this.info('');
    this.info(
      `Done in ${seconds}s: ${parts.join(', ') || 'nothing to do'} — ${files} ${fileLabel}`
    );
  }
}
