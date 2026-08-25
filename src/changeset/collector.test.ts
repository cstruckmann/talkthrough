import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectChangeset } from './collector.js';
import { ChangesetError } from './types.js';

/**
 * These drive the real git binary against throwaway repositories. The parsing
 * seams are unit tested separately; what is worth proving here is that the
 * command shapes and mode selection behave against actual git output.
 */

let repo: string;

const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    // git narrates branch switches on stderr; keep the test output clean.
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

const write = (relativePath: string, contents: string) => {
  writeFileSync(join(repo, relativePath), contents);
};

const commit = (message: string) => {
  git('add', '-A');
  git('commit', '--no-gpg-sign', '-m', message);
};

const collect = (baseRef?: string) =>
  collectChangeset({
    cwd: repo,
    maxPatchLines: 400,
    ...(baseRef === undefined ? {} : { baseRef }),
  });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'talkthrough-'));
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  write('README.md', 'hello\n');
  commit('initial');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('collectChangeset', () => {
  it('reports uncommitted edits against HEAD when nothing is committed ahead', async () => {
    write('README.md', 'hello\nworld\n');

    const changeset = await collect();

    expect(changeset.mode).toBe('working-tree');
    expect(changeset.baseRef).toBe('HEAD');
    expect(changeset.files).toHaveLength(1);
    expect(changeset.files[0]?.path).toBe('README.md');
    expect(changeset.files[0]?.status).toBe('modified');
    expect(changeset.files[0]?.additions).toBe(1);
    expect(changeset.files[0]?.patch).toContain('+world');
    expect(changeset.totalAdditions).toBe(1);
  });

  it('includes untracked files, which git diff alone would omit', async () => {
    write('brand-new.ts', 'export const x = 1;\n');

    const changeset = await collect();
    const added = changeset.files.find((file) => file.path === 'brand-new.ts');

    expect(added).toBeDefined();
    expect(added?.status).toBe('added');
    expect(added?.untracked).toBe(true);
    expect(added?.patch).toContain('export const x = 1;');
  });

  it('respects .gitignore when picking up untracked files', async () => {
    write('.gitignore', 'secret.txt\n');
    write('secret.txt', 'do not narrate me\n');

    const changeset = await collect();

    expect(changeset.files.map((file) => file.path)).not.toContain('secret.txt');
  });

  it('diffs the commit range when the branch is ahead of the base', async () => {
    git('checkout', '-b', 'feature');
    write('feature.ts', 'export const feature = true;\n');
    commit('add feature');

    const changeset = await collect('main');

    expect(changeset.mode).toBe('range');
    expect(changeset.baseRef).toBe('main');
    expect(changeset.files.map((file) => file.path)).toEqual(['feature.ts']);
    expect(changeset.files[0]?.untracked).toBe(false);
  });

  it('detects renames and records the previous path', async () => {
    write('original.ts', 'export const value = 1;\n');
    commit('add original');

    git('checkout', '-b', 'feature');
    git('mv', 'original.ts', 'renamed.ts');
    commit('rename');

    const changeset = await collect('main');
    const renamed = changeset.files.find((file) => file.path === 'renamed.ts');

    expect(renamed?.status).toBe('renamed');
    expect(renamed?.oldPath).toBe('original.ts');
  });

  it('skips binary files but still counts them', async () => {
    writeFileSync(join(repo, 'blob.bin'), Buffer.from([0, 1, 2, 0, 3, 255]));
    commit('add binary');

    git('checkout', '-b', 'feature');
    writeFileSync(join(repo, 'blob.bin'), Buffer.from([0, 9, 9, 0, 9, 254]));
    commit('change binary');

    const changeset = await collect('main');
    const binary = changeset.files.find((file) => file.path === 'blob.bin');

    expect(binary?.binary).toBe(true);
    expect(binary?.patch).toBe('');
    expect(changeset.binaryFileCount).toBe(1);
  });

  it('truncates an over-long patch and flags it', async () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    write('long.ts', `${long}\n`);

    const changeset = await collectChangeset({ cwd: repo, maxPatchLines: 50 });
    const file = changeset.files.find((entry) => entry.path === 'long.ts');

    expect(file?.truncated).toBe(true);
    expect(file?.patch).toContain('of this diff omitted');
    expect(changeset.truncatedFileCount).toBe(1);
  });

  it('raises an actionable error when there is nothing to explain', async () => {
    await expect(collect()).rejects.toMatchObject({
      name: 'ChangesetError',
      kind: 'empty-diff',
    });
  });

  it('raises an actionable error for a base ref that does not exist', async () => {
    write('README.md', 'changed\n');

    await expect(collect('no-such-branch')).rejects.toMatchObject({
      kind: 'bad-base-ref',
    });
  });

  it('raises an actionable error outside a git repository', async () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'talkthrough-plain-'));
    mkdirSync(join(notARepo, 'sub'), { recursive: true });

    try {
      await expect(
        collectChangeset({ cwd: join(notARepo, 'sub'), maxPatchLines: 400 }),
      ).rejects.toBeInstanceOf(ChangesetError);
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});
