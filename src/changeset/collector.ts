import type * as vscode from 'vscode';
import { run, ExecError } from '../util/exec.js';
import { parseNameStatusZ, parseNumstatZ } from './gitParse.js';
import { truncatePatch } from './truncate.js';
import { ChangesetError, type Changeset, type FileChange, type FileStatus } from './types.js';

/** git's canonical empty tree, used to diff a repository with no commits yet. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Refs tried in order when no base ref is configured. */
const DEFAULT_BASE_CANDIDATES = ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master'];

export interface CollectOptions {
  cwd: string;
  /** From `talkthrough.baseRef`. Empty or omitted means auto-detect. */
  baseRef?: string;
  /** Per-file patch line budget before truncation. */
  maxPatchLines: number;
  token?: vscode.CancellationToken;
}

export async function collectChangeset(options: CollectOptions): Promise<Changeset> {
  const repoRoot = await findRepoRoot(options);
  const git = (args: string[], allowedExitCodes?: number[]) =>
    run('git', args, {
      cwd: repoRoot,
      ...(options.token ? { token: options.token } : {}),
      ...(allowedExitCodes ? { allowedExitCodes } : {}),
    });

  const hasCommits = await refExists(repoRoot, 'HEAD', options);
  const { baseRef, diffRange, mode } = await resolveBase(repoRoot, hasCommits, options);

  const [numstat, nameStatus] = await Promise.all([
    git(['diff', '--numstat', '-z', '-M', ...diffRange]),
    git(['diff', '--name-status', '-z', '-M', ...diffRange]),
  ]);

  const statusByPath = new Map<string, FileStatus>(
    parseNameStatusZ(nameStatus.stdout).map((entry) => [entry.path, entry.status]),
  );

  const files: FileChange[] = [];

  for (const entry of parseNumstatZ(numstat.stdout)) {
    const status = statusByPath.get(entry.path) ?? (entry.oldPath ? 'renamed' : 'modified');

    if (entry.binary) {
      files.push({
        path: entry.path,
        ...(entry.oldPath === undefined ? {} : { oldPath: entry.oldPath }),
        status,
        additions: 0,
        deletions: 0,
        binary: true,
        patch: '',
        truncated: false,
        untracked: false,
      });
      continue;
    }

    const pathspec = entry.oldPath ? [entry.oldPath, entry.path] : [entry.path];
    const { stdout: patch } = await git(['diff', '-M', ...diffRange, '--', ...pathspec]);
    const truncation = truncatePatch(patch, options.maxPatchLines);

    files.push({
      path: entry.path,
      ...(entry.oldPath === undefined ? {} : { oldPath: entry.oldPath }),
      status,
      additions: entry.additions,
      deletions: entry.deletions,
      binary: false,
      patch: truncation.text,
      truncated: truncation.truncated,
      untracked: false,
    });
  }

  if (mode === 'working-tree') {
    files.push(...(await collectUntracked(repoRoot, options)));
  }

  if (files.length === 0) {
    throw new ChangesetError(
      mode === 'working-tree'
        ? 'No uncommitted changes to explain.'
        : `No changes between ${baseRef} and HEAD.`,
      'empty-diff',
    );
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    repoRoot,
    baseRef,
    mode,
    files,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
    truncatedFileCount: files.filter((file) => file.truncated).length,
    binaryFileCount: files.filter((file) => file.binary).length,
  };
}

async function findRepoRoot(options: CollectOptions): Promise<string> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], {
      cwd: options.cwd,
      ...(options.token ? { token: options.token } : {}),
    });
    return stdout.trim();
  } catch (error) {
    if (error instanceof ExecError && error.cause.code === 'ENOENT') {
      throw new ChangesetError(
        'git was not found on your PATH. Talkthrough needs git to read your changes.',
        'no-git',
      );
    }
    throw new ChangesetError(
      'This folder is not inside a git repository, so there are no changes to explain.',
      'not-a-repo',
    );
  }
}

async function refExists(cwd: string, ref: string, options: CollectOptions): Promise<boolean> {
  try {
    await run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd,
      ...(options.token ? { token: options.token } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

interface ResolvedBase {
  baseRef: string;
  /** Arguments naming the diff endpoints, spread into the git invocation. */
  diffRange: string[];
  mode: Changeset['mode'];
}

async function resolveBase(
  cwd: string,
  hasCommits: boolean,
  options: CollectOptions,
): Promise<ResolvedBase> {
  if (!hasCommits) {
    // An unborn HEAD: everything staged so far is new.
    return { baseRef: EMPTY_TREE, diffRange: [EMPTY_TREE], mode: 'working-tree' };
  }

  const configured = options.baseRef?.trim();
  if (configured) {
    if (!(await refExists(cwd, configured, options))) {
      throw new ChangesetError(
        `The configured base ref "${configured}" does not exist in this repository. ` +
          'Update the talkthrough.baseRef setting.',
        'bad-base-ref',
      );
    }
    return pickMode(cwd, configured, options);
  }

  for (const candidate of DEFAULT_BASE_CANDIDATES) {
    if (await refExists(cwd, candidate, options)) {
      return pickMode(cwd, candidate, options);
    }
  }

  // No default branch to compare against: explain what is uncommitted.
  return { baseRef: 'HEAD', diffRange: ['HEAD'], mode: 'working-tree' };
}

/**
 * Prefers the committed range, but falls back to the working tree when HEAD has
 * no commits beyond the base — the common shape when an agent has just edited
 * files without committing.
 */
async function pickMode(
  cwd: string,
  baseRef: string,
  options: CollectOptions,
): Promise<ResolvedBase> {
  const { stdout } = await run('git', ['rev-list', '--count', `${baseRef}..HEAD`], {
    cwd,
    ...(options.token ? { token: options.token } : {}),
  });
  const ahead = Number.parseInt(stdout.trim(), 10) || 0;

  return ahead > 0
    ? { baseRef, diffRange: [`${baseRef}...HEAD`], mode: 'range' }
    : { baseRef: 'HEAD', diffRange: ['HEAD'], mode: 'working-tree' };
}

/**
 * New files an agent created are usually untracked, and `git diff` ignores
 * them entirely — so a tour built without these would silently omit them.
 */
async function collectUntracked(cwd: string, options: CollectOptions): Promise<FileChange[]> {
  const { stdout } = await run('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd,
    ...(options.token ? { token: options.token } : {}),
  });

  const paths = stdout.split('\0').filter((path) => path !== '');
  const files: FileChange[] = [];

  for (const path of paths) {
    // --no-index exits 1 when the files differ, which is the expected case here.
    const { stdout: patch } = await run(
      'git',
      ['diff', '--no-index', '--', nullDevice(), path],
      {
        cwd,
        allowedExitCodes: [1],
        ...(options.token ? { token: options.token } : {}),
      },
    );

    const binary = /^Binary files .* differ$/m.test(patch);
    const truncation = truncatePatch(patch, options.maxPatchLines);
    const additions = binary ? 0 : patch.split('\n').filter((line) => line.startsWith('+')).length;

    files.push({
      path,
      status: 'added',
      additions: Math.max(0, additions - 1), // discount the +++ header line
      deletions: 0,
      binary,
      patch: binary ? '' : truncation.text,
      truncated: binary ? false : truncation.truncated,
      untracked: true,
    });
  }

  return files;
}

function nullDevice(): string {
  return process.platform === 'win32' ? 'NUL' : '/dev/null';
}
