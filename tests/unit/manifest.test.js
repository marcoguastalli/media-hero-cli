import { jest } from '@jest/globals';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Manifest } from '../../src/manifest/manifest.js';

const makeTempDir = () => mkdtemp(path.join(os.tmpdir(), 'mhc-manifest-'));

describe('Manifest', () => {
  it('starts fresh when no manifest file exists', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();

    expect(manifest.data).toEqual({ version: 1, entries: {} });
    expect(manifest.isCompleted('ABC')).toBe(false);
  });

  it('persists entries incrementally and reloads them', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();

    await manifest.record('ABC123', {
      url: 'https://www.instagram.com/p/ABC123/',
      status: 'completed',
      files: ['ABC123/ABC123.jpg'],
      extractor: 'gallery-dl',
    });

    const raw = await readFile(path.join(outDir, 'manifest.json'), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);

    const reloaded = await new Manifest(outDir).load();
    expect(reloaded.isCompleted('ABC123')).toBe(true);
    const entry = reloaded.getEntry('ABC123');
    expect(entry.extractor).toBe('gallery-dl');
    expect(typeof entry.timestamp).toBe('string');
  });

  it('does not treat failed entries as completed', async () => {
    const outDir = await makeTempDir();
    const manifest = await new Manifest(outDir).load();
    await manifest.record('BAD', {
      url: 'https://www.instagram.com/p/BAD/',
      status: 'failed',
      files: [],
      error: 'boom',
    });

    expect(manifest.isCompleted('BAD')).toBe(false);
  });

  it('ignores a corrupted manifest file with a warning', async () => {
    const outDir = await makeTempDir();
    await writeFile(path.join(outDir, 'manifest.json'), 'not json at all');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const manifest = await new Manifest(outDir).load();
    expect(manifest.data.entries).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring unreadable manifest')
    );
    warnSpy.mockRestore();
  });

  it('starts fresh when the manifest JSON has an unexpected shape', async () => {
    const outDir = await makeTempDir();
    await writeFile(path.join(outDir, 'manifest.json'), '{"version":1}\n');

    const manifest = await new Manifest(outDir).load();
    expect(manifest.data).toEqual({ version: 1, entries: {} });
  });

  it('creates the output directory on first record', async () => {
    const outDir = path.join(await makeTempDir(), 'nested', 'out');
    const manifest = await new Manifest(outDir).load();
    await manifest.record('X', {
      url: 'https://u',
      status: 'failed',
      files: [],
    });

    const reloaded = await new Manifest(outDir).load();
    expect(reloaded.getEntry('X').status).toBe('failed');
  });
});
