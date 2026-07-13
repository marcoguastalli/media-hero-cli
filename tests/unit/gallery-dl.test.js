import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '../../src/extractors/errors.js';
import { createGalleryDlExtractor } from '../../src/extractors/gallery-dl.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/gallery-dl'
);
const fixture = name => readFileSync(path.join(fixturesDir, name), 'utf8');

/**
 * Build a spawnFn that emits the given output on the next tick.
 * @param {Object} script - { stdout?, stderr?, code?, spawnError? }
 */
const makeSpawnFn = (script, calls = []) => {
  return (binary, args) => {
    calls.push({ binary, args });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    setImmediate(() => {
      if (script.spawnError) {
        child.emit('error', script.spawnError);
        return;
      }
      if (script.stdout) {
        child.stdout.emit('data', script.stdout);
      }
      if (script.stderr) {
        child.stderr.emit('data', script.stderr);
      }
      child.emit('close', script.code ?? 0);
    });

    return child;
  };
};

describe('gallery-dl extractor', () => {
  it('parses downloaded file paths from stdout, including skipped ones', async () => {
    const calls = [];
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ stdout: fixture('success-stdout.txt') }, calls),
    });

    const result = await extractor.extract(
      'https://www.instagram.com/p/C7xKp2AbCdE/',
      { destDir: './downloads/C7xKp2AbCdE' }
    );

    expect(result.directDownload).toEqual([
      './downloads/C7xKp2AbCdE/C7xKp2AbCdE_1.jpg',
      './downloads/C7xKp2AbCdE/C7xKp2AbCdE_2.mp4',
      './downloads/C7xKp2AbCdE/C7xKp2AbCdE_3.jpg',
    ]);
    expect(result.media.map(m => m.type)).toEqual(['image', 'video', 'image']);
  });

  it('passes destination directory and carousel range to gallery-dl', async () => {
    const calls = [];
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ stdout: 'x/a.jpg\n' }, calls),
    });
    await extractor.extract('https://url', { destDir: '/tmp/out/ABC' });

    expect(calls[0].binary).toBe('gallery-dl');
    expect(calls[0].args).toEqual([
      '-D',
      '/tmp/out/ABC',
      '--range',
      '1-10',
      'https://url',
    ]);
  });

  it('passes the cookies file to gallery-dl when provided', async () => {
    const calls = [];
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ stdout: 'x/a.jpg\n' }, calls),
    });
    await extractor.extract('https://url', {
      destDir: '/tmp/out/ABC',
      cookiesFile: '/tmp/cookies.txt',
    });

    expect(calls[0].args).toEqual([
      '-D',
      '/tmp/out/ABC',
      '--range',
      '1-10',
      '--cookies',
      '/tmp/cookies.txt',
      'https://url',
    ]);
  });

  it('maps a missing binary to tool-missing with an install hint', async () => {
    const enoent = Object.assign(new Error('spawn gallery-dl ENOENT'), {
      code: 'ENOENT',
    });
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ spawnError: enoent }),
    });

    await expect(
      extractor.extract('https://url', { destDir: '/tmp' })
    ).rejects.toMatchObject({
      code: ERROR_CODES.TOOL_MISSING,
      message: expect.stringContaining('pip install gallery-dl'),
    });
  });

  it('maps other spawn errors to extraction-failed', async () => {
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ spawnError: new Error('EACCES') }),
    });
    await expect(
      extractor.extract('https://url', { destDir: '/tmp' })
    ).rejects.toMatchObject({ code: ERROR_CODES.EXTRACTION_FAILED });
  });

  it('maps login-wall stderr to requires-login', async () => {
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ stderr: fixture('login-stderr.txt'), code: 1 }),
    });
    await expect(
      extractor.extract('https://url', { destDir: '/tmp' })
    ).rejects.toMatchObject({ code: ERROR_CODES.REQUIRES_LOGIN });
  });

  it('maps 404 stderr to not-found', async () => {
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({
        stderr: fixture('not-found-stderr.txt'),
        code: 1,
      }),
    });
    await expect(
      extractor.extract('https://url', { destDir: '/tmp' })
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('maps other non-zero exits to extraction-failed', async () => {
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ stderr: 'boom', code: 4 }),
    });
    await expect(
      extractor.extract('https://url', { destDir: '/tmp' })
    ).rejects.toMatchObject({ code: ERROR_CODES.EXTRACTION_FAILED });
  });

  it('targets the system gallery-dl binary by default', () => {
    expect(createGalleryDlExtractor().name).toBe('gallery-dl');
  });

  it('ignores a close event arriving after a spawn error', async () => {
    const spawnFn = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => {
        child.emit(
          'error',
          Object.assign(new Error('spawn gallery-dl ENOENT'), {
            code: 'ENOENT',
          })
        );
        child.emit('close', 1);
      });
      return child;
    };
    const extractor = createGalleryDlExtractor({ spawnFn });

    await expect(
      extractor.extract('https://url', { destDir: '/tmp' })
    ).rejects.toMatchObject({ code: ERROR_CODES.TOOL_MISSING });
  });

  it('fails when gallery-dl exits cleanly but reports no files', async () => {
    const extractor = createGalleryDlExtractor({
      spawnFn: makeSpawnFn({ stdout: '\n', code: 0 }),
    });
    await expect(
      extractor.extract('https://url', { destDir: '/tmp' })
    ).rejects.toMatchObject({ code: ERROR_CODES.EXTRACTION_FAILED });
  });
});
