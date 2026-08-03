import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildCollectionUrls } from '../../src/collection/build-urls.js';
import { Manifest } from '../../src/manifest/manifest.js';

const makeTempDir = () => mkdtemp(path.join(os.tmpdir(), 'mhc-collection-'));

const html = (...shortcodes) =>
  shortcodes.map(code => `<a href="/p/${code}/">post</a>`).join('\n');

describe('buildCollectionUrls', () => {
  it('treats all links as new when nothing is downloaded or listed', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();

    const result = await buildCollectionUrls({
      html: html('AAA111', 'BBB222'),
      manifest,
      outDir,
    });

    expect(result.newUrls).toEqual([
      'https://www.source-of-media.com/p/AAA111/',
      'https://www.source-of-media.com/p/BBB222/',
    ]);
    expect(result.stats).toEqual({
      found: 2,
      downloaded: 0,
      listed: 0,
      added: 2,
      pruned: 0,
    });
  });

  it('skips links already completed with files still on disk', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();
    await manifest.record('AAA111', {
      url: 'https://www.source-of-media.com/p/AAA111/',
      status: 'completed',
      files: ['AAA111/AAA111.jpg'],
      extractor: 'imginn',
    });
    await mkdir(path.join(outDir, 'AAA111'), { recursive: true });
    await writeFile(path.join(outDir, 'AAA111', 'AAA111.jpg'), 'data');

    const result = await buildCollectionUrls({
      html: html('AAA111', 'BBB222'),
      manifest,
      outDir,
    });

    expect(result.newUrls).toEqual(['https://www.source-of-media.com/p/BBB222/']);
    expect(result.stats).toMatchObject({
      found: 2,
      downloaded: 1,
      added: 1,
      pruned: 0,
    });
  });

  it('re-includes completed entries whose files are missing from disk', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();
    await manifest.record('AAA111', {
      url: 'https://www.source-of-media.com/p/AAA111/',
      status: 'completed',
      files: ['AAA111/AAA111.jpg'],
      extractor: 'imginn',
    });
    // File was never written / was deleted.

    const result = await buildCollectionUrls({
      html: html('AAA111'),
      manifest,
      outDir,
    });

    expect(result.newUrls).toEqual(['https://www.source-of-media.com/p/AAA111/']);
    expect(result.stats.downloaded).toBe(0);
  });

  it('skips links already present in the existing urls.txt content', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();

    const result = await buildCollectionUrls({
      html: html('AAA111', 'BBB222'),
      existingUrlsContent: 'https://www.source-of-media.com/p/AAA111/\n',
      manifest,
      outDir,
    });

    expect(result.newUrls).toEqual(['https://www.source-of-media.com/p/BBB222/']);
    expect(result.stats).toEqual({
      found: 2,
      downloaded: 0,
      listed: 1,
      added: 1,
      pruned: 0,
    });
  });

  it('returns nothing to add when the collection is empty', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();

    const result = await buildCollectionUrls({
      html: '<div>no links</div>',
      manifest,
      outDir,
    });

    expect(result.newUrls).toEqual([]);
    expect(result.stats).toEqual({
      found: 0,
      downloaded: 0,
      listed: 0,
      added: 0,
      pruned: 0,
    });
  });

  it('prunes existing urls.txt lines that are already downloaded', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();
    await manifest.record('AAA111', {
      url: 'https://www.source-of-media.com/p/AAA111/',
      status: 'completed',
      files: ['AAA111/AAA111.jpg'],
      extractor: 'imginn',
    });
    await mkdir(path.join(outDir, 'AAA111'), { recursive: true });
    await writeFile(path.join(outDir, 'AAA111', 'AAA111.jpg'), 'data');

    const result = await buildCollectionUrls({
      html: '<div>no links</div>',
      existingUrlsContent:
        '# my list\nhttps://www.source-of-media.com/p/AAA111/\nhttps://www.source-of-media.com/p/BBB222/\n',
      manifest,
      outDir,
    });

    expect(result.keptExistingLines).toEqual([
      'https://www.source-of-media.com/p/BBB222/',
    ]);
    expect(result.stats.pruned).toBe(1);
  });

  it('keeps existing lines whose files are missing from disk', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();
    await manifest.record('AAA111', {
      url: 'https://www.source-of-media.com/p/AAA111/',
      status: 'completed',
      files: ['AAA111/AAA111.jpg'],
      extractor: 'imginn',
    });
    // File was never written / was deleted.

    const result = await buildCollectionUrls({
      html: '<div>no links</div>',
      existingUrlsContent: 'https://www.source-of-media.com/p/AAA111/\n',
      manifest,
      outDir,
    });

    expect(result.keptExistingLines).toEqual([
      'https://www.source-of-media.com/p/AAA111/',
    ]);
    expect(result.stats.pruned).toBe(0);
  });
});
