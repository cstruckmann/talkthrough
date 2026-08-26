import { describe, expect, it, vi } from 'vitest';
import type { Changeset, FileChange } from '../changeset/types.js';
import type { TourBackend } from '../backends/types.js';
import {
  TWO_PASS_FILE_THRESHOLD,
  batchFiles,
  parseSummaries,
  shouldUseTwoPass,
  summarizeChangeset,
} from './twoPass.js';

const file = (path: string, patchLength = 100): FileChange => ({
  path,
  status: 'modified',
  additions: 5,
  deletions: 2,
  binary: false,
  patch: 'x'.repeat(patchLength),
  truncated: false,
  untracked: false,
});

const changeset = (files: FileChange[]): Changeset => ({
  repoRoot: '/repo',
  baseRef: 'main',
  mode: 'range',
  files,
  totalAdditions: 0,
  totalDeletions: 0,
  truncatedFileCount: 0,
  binaryFileCount: 0,
});

const manyFiles = (count: number, patchLength = 100) =>
  Array.from({ length: count }, (_, i) => file(`src/file-${i}.ts`, patchLength));

describe('shouldUseTwoPass', () => {
  it('leaves an ordinary changeset alone', () => {
    expect(shouldUseTwoPass(changeset(manyFiles(5)))).toBe(false);
  });

  it('triggers above the file threshold', () => {
    expect(shouldUseTwoPass(changeset(manyFiles(TWO_PASS_FILE_THRESHOLD + 1)))).toBe(true);
  });

  it('does not trigger exactly at the threshold', () => {
    expect(shouldUseTwoPass(changeset(manyFiles(TWO_PASS_FILE_THRESHOLD)))).toBe(false);
  });
});

describe('batchFiles', () => {
  it('keeps a small changeset in one batch', () => {
    expect(batchFiles(manyFiles(3))).toHaveLength(1);
  });

  it('splits on the file count', () => {
    const batches = batchFiles(manyFiles(20), 8, 1_000_000);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(8);
    expect(batches[2]).toHaveLength(4);
  });

  it('splits on the character budget even when few files', () => {
    const batches = batchFiles(manyFiles(4, 30_000), 8, 60_000);

    expect(batches.length).toBeGreaterThan(1);
  });

  it('gives an oversized file a batch of its own rather than dropping it', () => {
    const files = [file('small.ts', 10), file('huge.ts', 500_000), file('other.ts', 10)];
    const batches = batchFiles(files, 8, 60_000);

    expect(batches.flat()).toHaveLength(3);
    expect(batches.some((batch) => batch.length === 1 && batch[0]?.path === 'huge.ts')).toBe(true);
  });

  it('loses no files across the split', () => {
    const files = manyFiles(50);
    const batched = batchFiles(files).flat();

    expect(batched).toHaveLength(50);
    expect(new Set(batched.map((entry) => entry.path)).size).toBe(50);
  });

  it('handles an empty changeset', () => {
    expect(batchFiles([])).toEqual([]);
  });
});

describe('parseSummaries', () => {
  it('splits the response into per-file blocks', () => {
    const response = [
      '## src/a.ts',
      'What: it gained a retry.',
      'Lines: 10-20 the wrapper',
      '## src/b.ts',
      'What: it calls the new wrapper.',
    ].join('\n');

    const summaries = parseSummaries(response);

    expect(summaries.get('src/a.ts')).toContain('gained a retry');
    expect(summaries.get('src/b.ts')).toContain('calls the new wrapper');
  });

  it('ignores preamble before the first heading', () => {
    const summaries = parseSummaries('Sure, here you go:\n## src/a.ts\nWhat: something.');

    expect([...summaries.keys()]).toEqual(['src/a.ts']);
  });

  it('drops a heading with an empty body', () => {
    expect(parseSummaries('## src/a.ts\n\n   \n').size).toBe(0);
  });

  it('returns nothing for output with no headings', () => {
    expect(parseSummaries('I could not summarize these.').size).toBe(0);
  });

  it('keeps paths containing spaces', () => {
    const summaries = parseSummaries('## docs/my notes.md\nWhat: notes changed.');

    expect(summaries.has('docs/my notes.md')).toBe(true);
  });
});

describe('summarizeChangeset', () => {
  const template = 'SUMMARIZE:\n{{CHANGESET}}';

  const backendReturning = (response: string): TourBackend => ({
    id: 'claude-cli',
    label: 'stub',
    isAvailable: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(response),
    generateTour: vi.fn(),
  });

  it('replaces each diff with its summary and marks it', async () => {
    const backend = backendReturning('## src/file-0.ts\nWhat: it changed meaningfully.');
    const result = await summarizeChangeset(backend, template, changeset([file('src/file-0.ts')]));

    expect(result.files[0]?.summarized).toBe(true);
    expect(result.files[0]?.patch).toContain('changed meaningfully');
  });

  it('keeps the diff for a file the summarizer skipped', async () => {
    const backend = backendReturning('## src/file-0.ts\nWhat: covered.');
    const result = await summarizeChangeset(
      backend,
      template,
      changeset([file('src/file-0.ts'), file('src/file-1.ts')]),
    );

    expect(result.files[1]?.summarized).toBeUndefined();
    expect(result.files[1]?.patch).toBe(file('src/file-1.ts').patch);
  });

  it('makes one backend call per batch', async () => {
    const backend = backendReturning('## src/file-0.ts\nWhat: covered.');
    await summarizeChangeset(backend, template, changeset(manyFiles(20)));

    expect(backend.complete).toHaveBeenCalledTimes(3);
  });

  it('reports progress per batch', async () => {
    const backend = backendReturning('## src/file-0.ts\nWhat: covered.');
    const onProgress = vi.fn();

    await summarizeChangeset(backend, template, changeset(manyFiles(20)), { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]?.[0]).toContain('batch 1 of 3');
  });

  it('substitutes the changeset into the template', async () => {
    const backend = backendReturning('## src/file-0.ts\nWhat: covered.');
    await summarizeChangeset(backend, template, changeset([file('src/file-0.ts')]));

    const prompt = (backend.complete as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(prompt).toContain('SUMMARIZE:');
    expect(prompt).toContain('src/file-0.ts');
    expect(prompt).not.toContain('{{CHANGESET}}');
  });

  it('preserves the file order of the original changeset', async () => {
    const backend = backendReturning('## src/file-0.ts\nWhat: covered.');
    const original = manyFiles(12);
    const result = await summarizeChangeset(backend, template, changeset(original));

    expect(result.files.map((entry) => entry.path)).toEqual(original.map((entry) => entry.path));
  });
});
