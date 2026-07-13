/**
 * Full-pipeline integration test: real url-parser, manifest, queue,
 * reporter, and filesystem (in a temp dir); only the extractor chain
 * and fetch are faked. No network access.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runApp } from '../../src/app.js';
import { DownloadQueue } from '../../src/download/queue.js';
import { ERROR_CODES, ExtractorError } from '../../src/extractors/errors.js';
import { Reporter } from '../../src/report/reporter.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures'
);

const streamFrom = text =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

/** Fake extractor chain scripted by shortcode found in the URL. */
const makeFakeChain = () => {
  const calls = [];
  return {
    calls,
    async extract(url, { destDir }) {
      calls.push(url);
      if (url.includes('SUCCESS01')) {
        return {
          media: [
            { url: 'https://cdn.example.com/a_1080.jpg', type: 'image' },
            { url: 'https://cdn.example.com/b.mp4', type: 'video' },
          ],
          extractor: 'playwright',
        };
      }
      if (url.includes('LOGIN0001')) {
        throw new ExtractorError(ERROR_CODES.REQUIRES_LOGIN, 'login wall');
      }
      if (url.includes('DIRECT001')) {
        const filePath = path.join(destDir, 'direct.jpg');
        await writeFile(filePath, 'DIRECT-DATA');
        return {
          media: [{ url, type: 'image', filename: filePath }],
          directDownload: [filePath],
          extractor: 'gallery-dl',
        };
      }
      throw new ExtractorError(ERROR_CODES.EXTRACTION_FAILED, 'no media');
    },
  };
};

const makeDeps = () => {
  const lines = [];
  const delays = [];
  return {
    lines,
    delays,
    chain: makeFakeChain(),
    queue: new DownloadQueue({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        body: streamFrom('FILE-DATA'),
      }),
      sleepFn: async () => {},
    }),
    reporter: new Reporter({ out: { write: chunk => lines.push(chunk) } }),
    sleepFn: async ms => delays.push(ms),
  };
};

const setup = async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'mhc-pipeline-'));
  const urlsFile = path.join(outDir, 'urls.txt');
  await copyFile(path.join(fixturesDir, 'urls.txt'), urlsFile);
  return { outDir: path.join(outDir, 'downloads'), urlsFile };
};

describe('pipeline', () => {
  it('processes a mixed list end to end', async () => {
    const { outDir, urlsFile } = await setup();
    const deps = makeDeps();

    const { exitCode, results } = await runApp(
      { urlsFile, outDir, delayMs: 10 },
      deps
    );

    expect(exitCode).toBe(1);
    expect(results.map(r => r.status)).toEqual([
      'completed',
      'requires-login',
      'failed',
      'invalid-url',
      'completed',
    ]);

    const first = await readFile(
      path.join(outDir, 'SUCCESS01', 'SUCCESS01_1.jpg'),
      'utf8'
    );
    expect(first).toBe('FILE-DATA');
    expect(existsSync(path.join(outDir, 'SUCCESS01', 'SUCCESS01_2.mp4'))).toBe(
      true
    );

    const manifest = JSON.parse(
      await readFile(path.join(outDir, 'manifest.json'), 'utf8')
    );
    expect(manifest.entries.SUCCESS01).toMatchObject({
      status: 'completed',
      extractor: 'playwright',
      files: [
        path.join('SUCCESS01', 'SUCCESS01_1.jpg'),
        path.join('SUCCESS01', 'SUCCESS01_2.mp4'),
      ],
    });
    expect(manifest.entries.LOGIN0001.status).toBe('requires-login');
    expect(manifest.entries.FAILURE01.status).toBe('failed');
    expect(
      manifest.entries['https://www.instagram.com/heroaccount/'].status
    ).toBe('invalid-url');
    expect(manifest.entries.DIRECT001).toMatchObject({
      status: 'completed',
      extractor: 'gallery-dl',
      files: [path.join('DIRECT001', 'direct.jpg')],
    });

    // delay after each network-touching URL except the last one;
    // no delay after the invalid (offline) entry
    expect(deps.delays).toEqual([10, 10, 10]);

    const summary = deps.lines.at(-1);
    expect(summary).toContain('2 completed');
    expect(summary).toContain('3 files');
  });

  it('skips completed URLs on re-run and retries the rest', async () => {
    const { outDir, urlsFile } = await setup();
    await runApp({ urlsFile, outDir, delayMs: 0 }, makeDeps());

    const deps = makeDeps();
    const { exitCode, results } = await runApp(
      { urlsFile, outDir, delayMs: 0 },
      deps
    );

    expect(exitCode).toBe(1);
    expect(results.map(r => r.status)).toEqual([
      'skipped',
      'requires-login',
      'failed',
      'invalid-url',
      'skipped',
    ]);
    expect(deps.chain.calls).toEqual([
      'https://www.instagram.com/reel/LOGIN0001/',
      'https://www.instagram.com/p/FAILURE01/',
    ]);
  });

  it('re-downloads completed URLs with force', async () => {
    const { outDir, urlsFile } = await setup();
    await runApp({ urlsFile, outDir, delayMs: 0 }, makeDeps());

    const deps = makeDeps();
    const { results } = await runApp(
      { urlsFile, outDir, delayMs: 0, force: true },
      deps
    );

    expect(results.filter(r => r.status === 'skipped')).toHaveLength(0);
    expect(deps.chain.calls).toHaveLength(4);
  });

  it('dry-run touches neither network nor disk', async () => {
    const { outDir, urlsFile } = await setup();
    const deps = makeDeps();

    const { exitCode, results } = await runApp(
      { urlsFile, outDir, delayMs: 0, dryRun: true },
      deps
    );

    expect(results.map(r => r.status)).toEqual([
      'dry-run',
      'dry-run',
      'dry-run',
      'invalid-url',
      'dry-run',
    ]);
    expect(exitCode).toBe(1);
    expect(deps.chain.calls).toEqual([]);
    expect(deps.delays).toEqual([]);
    expect(existsSync(path.join(outDir, 'manifest.json'))).toBe(false);
    expect(existsSync(path.join(outDir, 'SUCCESS01'))).toBe(false);
  });

  it('exits 0 when every URL succeeds, using the default delay', async () => {
    const { outDir, urlsFile } = await setup();
    await writeFile(urlsFile, 'https://www.instagram.com/p/SUCCESS01/\n');
    const deps = makeDeps();

    const { exitCode, results } = await runApp({ urlsFile, outDir }, deps);

    expect(exitCode).toBe(0);
    expect(results.map(r => r.status)).toEqual(['completed']);
    expect(deps.delays).toEqual([]);
  });

  it('rate-limits with a real timer when no sleep function is injected', async () => {
    const { outDir, urlsFile } = await setup();
    await writeFile(
      urlsFile,
      [
        'https://www.instagram.com/p/SUCCESS01/',
        'https://www.instagram.com/p/DIRECT001/',
        '',
      ].join('\n')
    );
    const deps = makeDeps();
    delete deps.sleepFn;

    const { exitCode } = await runApp({ urlsFile, outDir, delayMs: 0 }, deps);
    expect(exitCode).toBe(0);
  });

  it('reports the message of stackless errors in verbose mode', async () => {
    const { outDir, urlsFile } = await setup();
    await writeFile(urlsFile, 'https://www.instagram.com/p/FAILURE01/\n');
    const deps = makeDeps();
    deps.reporter = new Reporter({
      out: { write: chunk => deps.lines.push(chunk) },
      verbose: true,
    });
    deps.chain = {
      async extract() {
        const error = new Error('plain failure');
        error.stack = undefined;
        throw error;
      },
    };

    const { results } = await runApp({ urlsFile, outDir, delayMs: 0 }, deps);
    expect(results[0]).toMatchObject({
      status: 'failed',
      error: 'plain failure',
    });
    expect(deps.lines).toContain('plain failure\n');
  });

  it('fails the whole post when a file download fails', async () => {
    const { outDir, urlsFile } = await setup();
    const deps = makeDeps();
    deps.queue = new DownloadQueue({
      fetchFn: async () => ({ ok: false, status: 500 }),
      retryAttempts: 0,
      sleepFn: async () => {},
    });

    const { results } = await runApp({ urlsFile, outDir, delayMs: 0 }, deps);
    const success = results.find(r => r.key === 'SUCCESS01');
    expect(success.status).toBe('failed');
    expect(success.error).toContain('HTTP 500');
  });
});
