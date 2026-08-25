import { describe, expect, it } from 'vitest';
import { parseNameStatusZ, parseNumstatZ } from './gitParse.js';

/** Builds NUL-delimited git output, the way `-z` emits it. */
const z = (...fields: string[]) => fields.map((field) => `${field}\u0000`).join('');

describe('parseNumstatZ', () => {
  it('parses plain additions and deletions', () => {
    const stdout = z('12\t3\tsrc/a.ts', '4\t0\tsrc/b.ts');

    expect(parseNumstatZ(stdout)).toEqual([
      { path: 'src/a.ts', additions: 12, deletions: 3, binary: false },
      { path: 'src/b.ts', additions: 4, deletions: 0, binary: false },
    ]);
  });

  it('marks binary files and zeroes their counts', () => {
    const stdout = z('-\t-\timages/logo.png');

    expect(parseNumstatZ(stdout)).toEqual([
      { path: 'images/logo.png', additions: 0, deletions: 0, binary: true },
    ]);
  });

  it('reads the old and new path of a rename from the following fields', () => {
    const stdout = z('1\t1\t', 'src/old.ts', 'src/new.ts');

    expect(parseNumstatZ(stdout)).toEqual([
      { path: 'src/new.ts', oldPath: 'src/old.ts', additions: 1, deletions: 1, binary: false },
    ]);
  });

  it('continues parsing after a rename record', () => {
    const stdout = z('1\t1\t', 'src/old.ts', 'src/new.ts', '5\t2\tsrc/after.ts');
    const entries = parseNumstatZ(stdout);

    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual({
      path: 'src/after.ts',
      additions: 5,
      deletions: 2,
      binary: false,
    });
  });

  it('handles paths containing spaces', () => {
    const stdout = z('2\t0\tdocs/my notes.md');

    expect(parseNumstatZ(stdout)[0]?.path).toBe('docs/my notes.md');
  });

  it('returns nothing for empty output', () => {
    expect(parseNumstatZ('')).toEqual([]);
  });
});

describe('parseNameStatusZ', () => {
  it('maps git status codes onto file statuses', () => {
    const stdout = z('A', 'src/new.ts', 'M', 'src/changed.ts', 'D', 'src/gone.ts');

    expect(parseNameStatusZ(stdout)).toEqual([
      { path: 'src/new.ts', status: 'added' },
      { path: 'src/changed.ts', status: 'modified' },
      { path: 'src/gone.ts', status: 'deleted' },
    ]);
  });

  it('treats a rename code as a rename and reads both paths', () => {
    const stdout = z('R100', 'src/old.ts', 'src/new.ts');

    expect(parseNameStatusZ(stdout)).toEqual([
      { path: 'src/new.ts', oldPath: 'src/old.ts', status: 'renamed' },
    ]);
  });

  it('treats a copy code as a rename', () => {
    const stdout = z('C75', 'src/a.ts', 'src/b.ts');

    expect(parseNameStatusZ(stdout)[0]?.status).toBe('renamed');
  });

  it('ignores a trailing status with no path', () => {
    expect(parseNameStatusZ(z('M'))).toEqual([]);
  });
});
