import { jest } from '@jest/globals';
import { Reporter } from '../../src/report/reporter.js';

const makeReporter = options => {
  const lines = [];
  const reporter = new Reporter({
    out: { write: chunk => lines.push(chunk) },
    ...options,
  });
  return { reporter, lines };
};

describe('Reporter', () => {
  it('formats progress lines with and without detail', () => {
    const { reporter, lines } = makeReporter();
    reporter.progress(3, 12, 'C7xKp2', 'completed', '2 files, gallery-dl');
    reporter.progress(4, 12, 'XYZ', 'failed');

    expect(lines).toEqual([
      '[3/12] C7xKp2 completed (2 files, gallery-dl)\n',
      '[4/12] XYZ failed\n',
    ]);
  });

  it('emits debug output only in verbose mode', () => {
    const quiet = makeReporter();
    quiet.reporter.debug('hidden');
    expect(quiet.lines).toEqual([]);

    const verbose = makeReporter({ verbose: true });
    verbose.reporter.debug('shown');
    expect(verbose.lines).toEqual(['shown\n']);
  });

  it('routes warnings to console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { reporter } = makeReporter();
    reporter.warn('heads up');
    expect(warnSpy).toHaveBeenCalledWith('heads up');
    warnSpy.mockRestore();
  });

  it('summarizes counts per status and total files', () => {
    const { reporter, lines } = makeReporter();
    reporter.summary(
      [
        { status: 'completed', files: ['a.jpg', 'b.mp4'] },
        { status: 'completed', files: ['c.jpg'] },
        { status: 'skipped', files: [] },
        { status: 'requires-login', files: [] },
        { status: 'invalid-url', files: [] },
      ],
      12345
    );

    const summaryLine = lines.at(-1);
    expect(summaryLine).toContain('Done in 12.3s');
    expect(summaryLine).toContain('2 completed');
    expect(summaryLine).toContain('1 skipped');
    expect(summaryLine).toContain('1 requires-login');
    expect(summaryLine).toContain('1 invalid-url');
    expect(summaryLine).toContain('3 files');
  });

  it('handles an empty run and singular file count', () => {
    const empty = makeReporter();
    empty.reporter.summary([], 100);
    expect(empty.lines.at(-1)).toContain('nothing to do');

    const single = makeReporter();
    single.reporter.summary([{ status: 'completed', files: ['a.jpg'] }], 100);
    expect(single.lines.at(-1)).toContain('1 file');
  });

  it('counts results that carry no files array', () => {
    const { reporter, lines } = makeReporter();
    reporter.summary([{ status: 'dry-run' }], 100);
    expect(lines.at(-1)).toContain('1 dry-run');
    expect(lines.at(-1)).toContain('0 files');
  });

  it('writes to stdout and stays quiet by default', () => {
    const reporter = new Reporter();
    expect(reporter.out).toBe(process.stdout);
    expect(reporter.verbose).toBe(false);
  });
});
