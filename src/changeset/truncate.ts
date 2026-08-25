export interface TruncationResult {
  text: string;
  truncated: boolean;
  originalLineCount: number;
}

/**
 * Shortens an over-long patch by keeping its head and tail and marking the gap.
 *
 * Head and tail are both kept because the interesting parts of a large diff
 * cluster at either end: the head shows what the change opens with, the tail
 * shows what it settles on. A head-only cut reliably hides the latter.
 */
export function truncatePatch(patch: string, maxLines: number): TruncationResult {
  if (maxLines < 2) {
    throw new Error('maxLines must be at least 2.');
  }

  const lines = patch.split('\n');
  // A trailing newline yields a final empty element that is not a real line.
  const hasTrailingNewline = lines.length > 0 && lines[lines.length - 1] === '';
  if (hasTrailingNewline) {
    lines.pop();
  }

  if (lines.length <= maxLines) {
    return { text: patch, truncated: false, originalLineCount: lines.length };
  }

  const headCount = Math.ceil((maxLines * 2) / 3);
  const tailCount = maxLines - headCount;
  const omitted = lines.length - headCount - tailCount;

  const kept = [
    ...lines.slice(0, headCount),
    `... ${omitted} line${omitted === 1 ? '' : 's'} of this diff omitted ...`,
    ...lines.slice(lines.length - tailCount),
  ];

  return {
    text: kept.join('\n') + (hasTrailingNewline ? '\n' : ''),
    truncated: true,
    originalLineCount: lines.length,
  };
}
