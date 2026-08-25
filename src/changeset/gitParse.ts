import type { FileStatus } from './types.js';

export interface NumstatEntry {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface NameStatusEntry {
  path: string;
  oldPath?: string;
  status: FileStatus;
}

/** Splits NUL-delimited git output, dropping the empty tail record. */
function splitZ(stdout: string): string[] {
  const records = stdout.split('\0');
  if (records.length > 0 && records[records.length - 1] === '') {
    records.pop();
  }
  return records;
}

/**
 * Parses `git diff --numstat -z`.
 *
 * Normal records are `additions\tdeletions\tpath`. Rename and copy records end
 * after the tabs and carry the old and new paths as the two following NUL
 * fields. Binary files report `-` for both counts.
 */
export function parseNumstatZ(stdout: string): NumstatEntry[] {
  const records = splitZ(stdout);
  const entries: NumstatEntry[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record === undefined || record === '') {
      continue;
    }

    const firstTab = record.indexOf('\t');
    const secondTab = record.indexOf('\t', firstTab + 1);
    if (firstTab === -1 || secondTab === -1) {
      continue;
    }

    const rawAdditions = record.slice(0, firstTab);
    const rawDeletions = record.slice(firstTab + 1, secondTab);
    const trailing = record.slice(secondTab + 1);
    const binary = rawAdditions === '-' && rawDeletions === '-';

    let path: string;
    let oldPath: string | undefined;
    if (trailing === '') {
      // Rename or copy: the next two records hold the old and new paths.
      const from = records[i + 1];
      const to = records[i + 2];
      if (from === undefined || to === undefined) {
        continue;
      }
      oldPath = from;
      path = to;
      i += 2;
    } else {
      path = trailing;
    }

    entries.push({
      path,
      ...(oldPath === undefined ? {} : { oldPath }),
      additions: binary ? 0 : Number.parseInt(rawAdditions, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(rawDeletions, 10) || 0,
      binary,
    });
  }

  return entries;
}

function toStatus(code: string): FileStatus {
  switch (code[0]) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
    case 'C':
      return 'renamed';
    default:
      return 'modified';
  }
}

/**
 * Parses `git diff --name-status -z`. Status codes and paths alternate as
 * separate NUL fields; rename and copy codes are followed by two paths.
 */
export function parseNameStatusZ(stdout: string): NameStatusEntry[] {
  const records = splitZ(stdout);
  const entries: NameStatusEntry[] = [];

  for (let i = 0; i < records.length; i++) {
    const code = records[i];
    if (code === undefined || code === '') {
      continue;
    }
    const status = toStatus(code);

    if (status === 'renamed') {
      const from = records[i + 1];
      const to = records[i + 2];
      if (from === undefined || to === undefined) {
        break;
      }
      entries.push({ path: to, oldPath: from, status });
      i += 2;
    } else {
      const path = records[i + 1];
      if (path === undefined) {
        break;
      }
      entries.push({ path, status });
      i += 1;
    }
  }

  return entries;
}
