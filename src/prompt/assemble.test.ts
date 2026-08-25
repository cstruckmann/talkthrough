import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Changeset, FileChange } from '../changeset/types.js';
import { assemblePrompt, renderChangeset } from './assemble.js';

const file = (overrides: Partial<FileChange> = {}): FileChange => ({
  path: 'src/queue.ts',
  status: 'modified',
  additions: 12,
  deletions: 3,
  binary: false,
  patch: '@@ -1,3 +1,4 @@\n context\n+added line\n',
  truncated: false,
  untracked: false,
  ...overrides,
});

const changeset = (overrides: Partial<Changeset> = {}): Changeset => ({
  repoRoot: '/repo',
  baseRef: 'main',
  mode: 'range',
  files: [file()],
  totalAdditions: 12,
  totalDeletions: 3,
  truncatedFileCount: 0,
  binaryFileCount: 0,
  ...overrides,
});

const template = '{{CHANGESET}}{{TRANSCRIPT}}{{CORRECTION}}';

describe('renderChangeset', () => {
  it('states what the diff is against in range mode', () => {
    expect(renderChangeset(changeset())).toContain('compared with main');
  });

  it('says the changes are uncommitted in working-tree mode', () => {
    const rendered = renderChangeset(changeset({ mode: 'working-tree', baseRef: 'HEAD' }));

    expect(rendered).toContain('uncommitted changes');
  });

  it('includes the patch under a heading naming the file', () => {
    const rendered = renderChangeset(changeset());

    expect(rendered).toContain('## src/queue.ts');
    expect(rendered).toContain('+added line');
    expect(rendered).toContain('+12 -3');
  });

  it('pluralises the file and line counts correctly', () => {
    expect(renderChangeset(changeset())).toContain('1 file changed');
    expect(
      renderChangeset(changeset({ files: [file(), file({ path: 'src/other.ts' })] })),
    ).toContain('2 files changed');
  });

  it('withholds binary contents and tells the model not to narrate them', () => {
    const rendered = renderChangeset(
      changeset({
        files: [file({ path: 'logo.png', binary: true, patch: '', additions: 0, deletions: 0 })],
        binaryFileCount: 1,
      }),
    );

    expect(rendered).toContain('Binary file, contents not shown');
    expect(rendered).toContain('do not create segments for them');
  });

  it('flags truncated diffs so the model knows the cut is not the end', () => {
    const rendered = renderChangeset(
      changeset({ files: [file({ truncated: true })], truncatedFileCount: 1 }),
    );

    expect(rendered).toContain('too long to include in full');
    expect(rendered).toContain('This diff was truncated');
  });

  it('reports a rename with its previous path', () => {
    const rendered = renderChangeset(
      changeset({ files: [file({ status: 'renamed', oldPath: 'src/old.ts' })] }),
    );

    expect(rendered).toContain('renamed from src/old.ts');
  });

  it('marks an untracked file as newly created', () => {
    const rendered = renderChangeset(
      changeset({ files: [file({ status: 'added', untracked: true })] }),
    );

    expect(rendered).toContain('not yet tracked by git');
  });
});

describe('assemblePrompt', () => {
  it('substitutes every placeholder', () => {
    const prompt = assemblePrompt(template, { changeset: changeset() });

    expect(prompt).not.toContain('{{');
  });

  it('omits the transcript section when there is no transcript', () => {
    const prompt = assemblePrompt(template, { changeset: changeset() });

    expect(prompt).not.toContain("agent's own account");
  });

  it('omits the transcript section when the transcript is only whitespace', () => {
    const prompt = assemblePrompt(template, { changeset: changeset(), transcript: '   \n ' });

    expect(prompt).not.toContain("agent's own account");
  });

  it('includes the transcript and tells the model the diff wins on conflict', () => {
    const prompt = assemblePrompt(template, {
      changeset: changeset(),
      transcript: 'I decided to use a token bucket.',
    });

    expect(prompt).toContain('I decided to use a token bucket.');
    expect(prompt).toContain('trust the diff');
  });

  it('keeps the tail of an over-long transcript and says it was cut', () => {
    const transcript = 'x'.repeat(20_000) + 'THE-RECENT-PART';
    const prompt = assemblePrompt(template, { changeset: changeset(), transcript });

    expect(prompt).toContain('THE-RECENT-PART');
    expect(prompt).toContain('earlier transcript omitted');
    expect(prompt.length).toBeLessThan(transcript.length);
  });

  it('omits the correction section on a first attempt', () => {
    const prompt = assemblePrompt(template, { changeset: changeset() });

    expect(prompt).not.toContain('Correction required');
  });

  it('includes the correction on a retry', () => {
    const prompt = assemblePrompt(template, {
      changeset: changeset(),
      correction: 'segments.0.startLine: startLine is 1-based',
    });

    expect(prompt).toContain('Correction required');
    expect(prompt).toContain('startLine is 1-based');
  });
});

describe('prompts/tour.md', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'prompts', 'tour.md'), 'utf8');

  it('carries every placeholder the assembler substitutes', () => {
    for (const placeholder of ['{{CHANGESET}}', '{{TRANSCRIPT}}', '{{CORRECTION}}']) {
      expect(source).toContain(placeholder);
    }
  });

  it('leaves no placeholder behind once assembled', () => {
    const prompt = assemblePrompt(source, { changeset: changeset() });

    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});
