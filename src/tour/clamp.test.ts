import { describe, expect, it } from 'vitest';
import { clampRange } from './clamp.js';

describe('clampRange', () => {
  it('leaves a range that fits the file alone', () => {
    expect(clampRange(10, 20, 100)).toEqual({ startLine: 10, endLine: 20, clamped: false });
  });

  it('accepts a range ending on the last line', () => {
    expect(clampRange(90, 100, 100)).toEqual({ startLine: 90, endLine: 100, clamped: false });
  });

  it('pulls an end line past the file back to the last line', () => {
    expect(clampRange(90, 400, 100)).toEqual({ startLine: 90, endLine: 100, clamped: true });
  });

  it('pulls a start line past the file back to the last line', () => {
    expect(clampRange(500, 600, 100)).toEqual({ startLine: 100, endLine: 100, clamped: true });
  });

  it('raises a zero or negative start line to the first line', () => {
    expect(clampRange(0, 5, 100)).toEqual({ startLine: 1, endLine: 5, clamped: true });
    expect(clampRange(-10, 5, 100)).toEqual({ startLine: 1, endLine: 5, clamped: true });
  });

  it('never returns an end before the start', () => {
    const result = clampRange(50, 20, 100);

    expect(result.endLine).toBeGreaterThanOrEqual(result.startLine);
  });

  it('handles an empty document', () => {
    expect(clampRange(5, 10, 0)).toEqual({ startLine: 1, endLine: 1, clamped: true });
  });

  it('truncates fractional line numbers', () => {
    expect(clampRange(4.9, 9.2, 100)).toMatchObject({ startLine: 4, endLine: 9 });
  });

  it('reports a single-line file as clamped when the range overshoots', () => {
    expect(clampRange(1, 40, 1)).toEqual({ startLine: 1, endLine: 1, clamped: true });
  });
});
