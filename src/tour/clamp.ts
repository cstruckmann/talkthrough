export interface ClampedRange {
  /** 1-based, guaranteed to exist in the document. */
  startLine: number;
  endLine: number;
  /** True when the segment's range did not fit the file as it is now. */
  clamped: boolean;
}

/**
 * Fits a segment's line range to the file as it exists right now.
 *
 * A tour is generated against a snapshot, and the file can move underneath it:
 * the agent keeps working, the user edits, a rebase lands. Rather than throwing
 * or silently revealing nothing, the range is squeezed into the document and
 * the caller is told it was, so it can say so once.
 */
export function clampRange(startLine: number, endLine: number, lineCount: number): ClampedRange {
  if (lineCount < 1) {
    return { startLine: 1, endLine: 1, clamped: true };
  }

  const start = Math.min(Math.max(1, Math.trunc(startLine)), lineCount);
  const end = Math.min(Math.max(start, Math.trunc(endLine)), lineCount);

  return {
    startLine: start,
    endLine: end,
    clamped: start !== startLine || end !== endLine,
  };
}
