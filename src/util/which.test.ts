import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findOnPath } from './which.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'talkthrough-path-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const createExecutable = (name: string) => {
  const target = join(dir, name);
  writeFileSync(target, '#!/bin/sh\nexit 0\n');
  chmodSync(target, 0o755);
  return target;
};

describe('findOnPath', () => {
  it('finds an executable on PATH', async () => {
    const expected = createExecutable('faketool');

    await expect(findOnPath('faketool', { PATH: dir }, 'linux')).resolves.toBe(expected);
  });

  it('returns undefined when the command is absent', async () => {
    await expect(findOnPath('missingtool', { PATH: dir }, 'linux')).resolves.toBeUndefined();
  });

  it('ignores a non-executable file of the same name', async () => {
    writeFileSync(join(dir, 'readonly'), 'not executable');
    chmodSync(join(dir, 'readonly'), 0o644);

    await expect(findOnPath('readonly', { PATH: dir }, 'linux')).resolves.toBeUndefined();
  });

  it('searches PATH entries in order', async () => {
    const first = mkdtempSync(join(tmpdir(), 'talkthrough-first-'));
    try {
      const expected = createExecutable('shared');
      const path = [dir, first].join(delimiter);

      await expect(findOnPath('shared', { PATH: path }, 'linux')).resolves.toBe(expected);
    } finally {
      rmSync(first, { recursive: true, force: true });
    }
  });

  it('returns undefined when PATH is unset', async () => {
    await expect(findOnPath('faketool', {}, 'linux')).resolves.toBeUndefined();
  });

  it('skips empty PATH entries', async () => {
    const expected = createExecutable('faketool');
    const path = ['', dir, ''].join(delimiter);

    await expect(findOnPath('faketool', { PATH: path }, 'linux')).resolves.toBe(expected);
  });

  it('tries PATHEXT suffixes on Windows', async () => {
    const expected = createExecutable('winttool.CMD');

    await expect(
      findOnPath('winttool', { PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32'),
    ).resolves.toBe(expected);
  });
});
