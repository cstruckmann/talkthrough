import { describe, expect, it } from 'vitest';
import { truncatePatch } from './truncate.js';

const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n');

describe('truncatePatch', () => {
  it('leaves a patch within budget untouched', () => {
    const patch = lines(10);
    const result = truncatePatch(patch, 10);

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(patch);
    expect(result.originalLineCount).toBe(10);
  });

  it('keeps both the head and the tail of an over-long patch', () => {
    const result = truncatePatch(lines(100), 30);

    expect(result.truncated).toBe(true);
    expect(result.originalLineCount).toBe(100);

    const kept = result.text.split('\n');
    expect(kept[0]).toBe('line 1');
    expect(kept[19]).toBe('line 20'); // ceil(30 * 2/3) head lines
    expect(kept[20]).toBe('... 70 lines of this diff omitted ...');
    expect(kept[kept.length - 1]).toBe('line 100');
  });

  it('reports the omitted line count in the marker', () => {
    const result = truncatePatch(lines(12), 10);

    expect(result.text).toContain('... 2 lines of this diff omitted ...');
  });

  it('uses a singular marker when exactly one line is dropped', () => {
    const result = truncatePatch(lines(11), 10);

    expect(result.text).toContain('... 1 line of this diff omitted ...');
  });

  it('does not count a trailing newline as a line', () => {
    const result = truncatePatch(`${lines(10)}\n`, 10);

    expect(result.truncated).toBe(false);
    expect(result.originalLineCount).toBe(10);
  });

  it('preserves a trailing newline when truncating', () => {
    const result = truncatePatch(`${lines(50)}\n`, 10);

    expect(result.text.endsWith('\n')).toBe(true);
  });

  it('rejects a budget too small to hold a marker', () => {
    expect(() => truncatePatch(lines(10), 1)).toThrow(/at least 2/);
  });
});
