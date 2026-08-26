import type { Changeset, FileChange } from '../changeset/types.js';

export interface PromptContext {
  changeset: Changeset;
  /** Agent session transcript, when the user enabled that enrichment. */
  transcript?: string;
  /** Validation feedback for the single retry; absent on the first attempt. */
  correction?: string;
}

/** Transcripts can be long; keep the tail, which holds the most recent work. */
const MAX_TRANSCRIPT_CHARS = 12_000;

export function assemblePrompt(template: string, context: PromptContext): string {
  return template
    .replace('{{CHANGESET}}', renderChangeset(context.changeset))
    .replace('{{TRANSCRIPT}}', renderTranscript(context.transcript))
    .replace('{{CORRECTION}}', renderCorrection(context.correction));
}

export function renderChangeset(changeset: Changeset): string {
  const header = [
    changeset.mode === 'working-tree'
      ? 'These are uncommitted changes in the working tree.'
      : `These are the changes on this branch compared with ${changeset.baseRef}.`,
    `${changeset.files.length} file${changeset.files.length === 1 ? '' : 's'} changed, ` +
      `${changeset.totalAdditions} insertion${changeset.totalAdditions === 1 ? '' : 's'}, ` +
      `${changeset.totalDeletions} deletion${changeset.totalDeletions === 1 ? '' : 's'}.`,
  ];

  if (changeset.binaryFileCount > 0) {
    header.push(
      `${changeset.binaryFileCount} binary file${changeset.binaryFileCount === 1 ? '' : 's'} ` +
        'changed and are not shown; do not create segments for them.',
    );
  }
  if (changeset.files.some((file) => file.summarized)) {
    header.push(
      'This changeset was too large to include in full, so each file below is ' +
        'described by a summary of its change rather than its diff. The line ' +
        'numbers in those summaries are already new-file line numbers; use them.',
    );
  }
  if (changeset.truncatedFileCount > 0) {
    header.push(
      `${changeset.truncatedFileCount} diff${changeset.truncatedFileCount === 1 ? ' was' : 's were'} ` +
        'too long to include in full and are marked where they were cut.',
    );
  }

  return [header.join('\n'), '', ...changeset.files.map(renderFile)].join('\n');
}

function renderFile(file: FileChange): string {
  const descriptor = [`## ${file.path}`];
  const facts: string[] = [file.status];

  if (file.oldPath) {
    facts.push(`renamed from ${file.oldPath}`);
  }
  if (file.untracked) {
    facts.push('new file, not yet tracked by git');
  }
  if (!file.binary) {
    facts.push(`+${file.additions} -${file.deletions}`);
  }

  descriptor.push(`(${facts.join(', ')})`);

  if (file.binary) {
    return `${descriptor.join(' ')}\n\nBinary file, contents not shown.\n`;
  }

  // A summarized file carries prose, not a diff. Labelling it stops the model
  // reading a summary as though it were the change itself.
  if (file.summarized) {
    return `${descriptor.join(' ')}\n\nSummary of this change, not the diff:\n\n${file.patch.trim()}\n`;
  }

  const note = file.truncated ? '\nThis diff was truncated; the omission is marked inline.' : '';

  return `${descriptor.join(' ')}${note}\n\n\`\`\`diff\n${file.patch.trimEnd()}\n\`\`\`\n`;
}

function renderTranscript(transcript: string | undefined): string {
  const trimmed = transcript?.trim();
  if (!trimmed) {
    return '';
  }

  const clipped =
    trimmed.length > MAX_TRANSCRIPT_CHARS
      ? `(earlier transcript omitted)\n${trimmed.slice(-MAX_TRANSCRIPT_CHARS)}`
      : trimmed;

  return [
    '',
    '# The agent\'s own account of this work',
    '',
    'This is what the agent said while making these changes. Use it to explain',
    'reasoning the diff alone cannot show. It is context, not ground truth: where',
    'it disagrees with the diff, trust the diff.',
    '',
    clipped,
    '',
  ].join('\n');
}

function renderCorrection(correction: string | undefined): string {
  const trimmed = correction?.trim();
  return trimmed ? `\n# Correction required\n\n${trimmed}\n` : '';
}
