import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DownloadQueue, verifyFiles } from '../../src/download/queue.js';

const streamFrom = text =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

const okResponse = (text = 'FILE-DATA') => ({
  ok: true,
  status: 200,
  body: streamFrom(text),
});

const makeTempDir = () => mkdtemp(path.join(os.tmpdir(), 'mhc-queue-'));

describe('DownloadQueue', () => {
  it('downloads media items sequentially into destDir', async () => {
    const destDir = await makeTempDir();
    const requested = [];
    const queue = new DownloadQueue({
      fetchFn: async url => {
        requested.push(url);
        return okResponse(`data for ${url}`);
      },
    });

    const results = await queue.downloadAll(
      [
        { url: 'https://cdn.example.com/a.jpg', filename: 'ABC_1.jpg' },
        { url: 'https://cdn.example.com/b.mp4', filename: 'ABC_2.mp4' },
      ],
      destDir
    );

    expect(results.map(r => r.status)).toEqual(['completed', 'completed']);
    expect(requested).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.mp4',
    ]);
    const first = await readFile(path.join(destDir, 'ABC_1.jpg'), 'utf8');
    expect(first).toBe('data for https://cdn.example.com/a.jpg');
  });

  it('retries with backoff delays and then succeeds', async () => {
    const destDir = await makeTempDir();
    const delays = [];
    let attempts = 0;
    const queue = new DownloadQueue({
      fetchFn: async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('network flake');
        }
        return okResponse();
      },
      retryDelays: [10, 20, 30],
      sleepFn: async ms => delays.push(ms),
    });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/a.jpg', filename: 'A.jpg' }],
      destDir
    );

    expect(results[0].status).toBe('completed');
    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it('reports failure after exhausting retries', async () => {
    const destDir = await makeTempDir();
    let attempts = 0;
    const queue = new DownloadQueue({
      fetchFn: async () => {
        attempts++;
        throw new Error('always down');
      },
      retryAttempts: 2,
      sleepFn: async () => {},
    });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/a.jpg', filename: 'A.jpg' }],
      destDir
    );

    expect(results[0]).toMatchObject({
      status: 'failed',
      error: 'always down',
    });
    expect(attempts).toBe(3);
  });

  it('treats non-OK HTTP responses as failures', async () => {
    const destDir = await makeTempDir();
    const queue = new DownloadQueue({
      fetchFn: async () => ({ ok: false, status: 404 }),
      retryAttempts: 0,
      sleepFn: async () => {},
    });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/gone.jpg', filename: 'G.jpg' }],
      destDir
    );

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('HTTP 404');
  });

  it('aborts downloads that exceed the file timeout', async () => {
    const destDir = await makeTempDir();
    const queue = new DownloadQueue({
      fetchFn: (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new Error('download aborted'))
          );
        }),
      fileTimeoutMs: 10,
      retryAttempts: 0,
      sleepFn: async () => {},
    });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/slow.mp4', filename: 'S.mp4' }],
      destDir
    );

    expect(results[0]).toMatchObject({
      status: 'failed',
      error: 'download aborted',
    });
  });

  it('removes partial files when the stream fails mid-download', async () => {
    const destDir = await makeTempDir();
    const queue = new DownloadQueue({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('partial'));
            controller.error(new Error('connection reset'));
          },
        }),
      }),
      retryAttempts: 0,
      sleepFn: async () => {},
    });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/a.jpg', filename: 'A.jpg' }],
      destDir
    );

    expect(results[0].status).toBe('failed');
    expect(existsSync(path.join(destDir, 'A.jpg'))).toBe(false);
  });

  it('defaults to global fetch and config-driven retry settings', () => {
    const queue = new DownloadQueue();
    expect(queue.fetchFn).toBe(globalThis.fetch);
    expect(queue.retryAttempts).toBe(3);
    expect(queue.fileTimeoutMs).toBe(60000);
  });

  it('treats an empty response body as a failure', async () => {
    const destDir = await makeTempDir();
    const queue = new DownloadQueue({
      fetchFn: async () => ({ ok: true, status: 200, body: null }),
      retryAttempts: 0,
      sleepFn: async () => {},
    });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/a.jpg', filename: 'A.jpg' }],
      destDir
    );

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('Empty response body');
  });

  it('falls back to the 2s delay when retryDelays runs out', async () => {
    const destDir = await makeTempDir();
    const delays = [];
    let attempts = 0;
    const queue = new DownloadQueue({
      fetchFn: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('flake');
        }
        return okResponse();
      },
      retryAttempts: 1,
      retryDelays: [],
      sleepFn: async ms => delays.push(ms),
    });

    await queue.downloadAll(
      [{ url: 'https://cdn.example.com/a.jpg', filename: 'A.jpg' }],
      destDir
    );

    expect(delays).toEqual([2000]);
  });

  it('sleeps between retries with the default timer', async () => {
    const destDir = await makeTempDir();
    let attempts = 0;
    const queue = new DownloadQueue({
      fetchFn: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('flake');
        }
        return okResponse();
      },
      retryAttempts: 1,
      retryDelays: [1],
    });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/a.jpg', filename: 'A.jpg' }],
      destDir
    );

    expect(results[0].status).toBe('completed');
    expect(attempts).toBe(2);
  });

  it('uniquifies filenames instead of overwriting', async () => {
    const destDir = await makeTempDir();
    await writeFile(path.join(destDir, 'A.jpg'), 'original');
    const queue = new DownloadQueue({ fetchFn: async () => okResponse('new') });

    const results = await queue.downloadAll(
      [{ url: 'https://cdn.example.com/a.jpg', filename: 'A.jpg' }],
      destDir
    );

    expect(results[0].filePath).toBe(path.join(destDir, 'A_1.jpg'));
    const original = await readFile(path.join(destDir, 'A.jpg'), 'utf8');
    expect(original).toBe('original');
  });
});

describe('verifyFiles', () => {
  it('accepts existing non-empty files', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'ok.jpg');
    await writeFile(filePath, 'content');
    await expect(verifyFiles([filePath])).resolves.toEqual([filePath]);
  });

  it('rejects missing files', async () => {
    const dir = await makeTempDir();
    await expect(verifyFiles([path.join(dir, 'nope.jpg')])).rejects.toThrow(
      'Missing or empty'
    );
  });

  it('rejects empty files', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'empty.jpg');
    await writeFile(filePath, '');
    await expect(verifyFiles([filePath])).rejects.toThrow('Missing or empty');
  });
});
