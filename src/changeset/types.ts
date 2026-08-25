export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface FileChange {
  /** Repo-relative path. For renames this is the new path. */
  path: string;
  /** Previous path, set only when status is 'renamed'. */
  oldPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  /** Binary files carry no patch text and are skipped by the generator. */
  binary: boolean;
  /** Unified diff for this file, possibly truncated. Empty when binary. */
  patch: string;
  /** True when the patch was shortened to fit the per-file line budget. */
  truncated: boolean;
  /** True for files not yet known to git (working-tree mode only). */
  untracked: boolean;
}

/** How the changeset was derived, which affects how the tour is framed. */
export type ChangesetMode =
  /** Committed work: `git diff <base>...HEAD`. */
  | 'range'
  /** Uncommitted work: the working tree against HEAD. */
  | 'working-tree';

export interface Changeset {
  repoRoot: string;
  /** The resolved base ref the diff was taken against. */
  baseRef: string;
  mode: ChangesetMode;
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
  /** Count of files whose patch was truncated. */
  truncatedFileCount: number;
  /** Count of binary files skipped. */
  binaryFileCount: number;
}

/** Raised for conditions the user can act on, surfaced verbatim in the UI. */
export class ChangesetError extends Error {
  constructor(
    message: string,
    public readonly kind: 'not-a-repo' | 'no-git' | 'empty-diff' | 'bad-base-ref',
  ) {
    super(message);
    this.name = 'ChangesetError';
  }
}
