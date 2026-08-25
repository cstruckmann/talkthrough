import { describe, expect, it } from 'vitest';
import { validateTourScript } from './schema.js';

const validSegment = {
  id: 'seg-1',
  file: 'src/api/client.ts',
  startLine: 42,
  endLine: 58,
  narration: 'First, the client gained a token-bucket rate limiter.',
  kind: 'change',
};

const validTour = {
  version: 1,
  title: 'Add rate limiting to API client',
  summary: 'A one-paragraph overview.',
  segments: [validSegment],
};

/** Builds a tour with one field of its single segment overridden. */
const withSegment = (overrides: Record<string, unknown>) => ({
  ...validTour,
  segments: [{ ...validSegment, ...overrides }],
});

describe('validateTourScript', () => {
  it('accepts a well-formed tour', () => {
    const result = validateTourScript(validTour);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tour.segments[0]?.id).toBe('seg-1');
    }
  });

  it('accepts every documented segment kind', () => {
    for (const kind of ['overview', 'change', 'reasoning', 'caveat']) {
      expect(validateTourScript(withSegment({ kind })).ok).toBe(true);
    }
  });

  it('rejects an unknown segment kind', () => {
    const result = validateTourScript(withSegment({ kind: 'digression' }));

    expect(result.ok).toBe(false);
  });

  it('rejects a version other than 1', () => {
    const result = validateTourScript({ ...validTour, version: 2 });

    expect(result.ok).toBe(false);
  });

  it('rejects a tour with no segments', () => {
    const result = validateTourScript({ ...validTour, segments: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('at least one segment');
    }
  });

  it('rejects duplicate segment ids', () => {
    const result = validateTourScript({
      ...validTour,
      segments: [validSegment, { ...validSegment, file: 'src/other.ts' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('unique');
    }
  });

  it('rejects an end line before the start line', () => {
    const result = validateTourScript(withSegment({ startLine: 50, endLine: 20 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('endLine');
    }
  });

  it('accepts a single-line segment', () => {
    expect(validateTourScript(withSegment({ startLine: 7, endLine: 7 })).ok).toBe(true);
  });

  it('rejects a zero or negative start line, since lines are 1-based', () => {
    expect(validateTourScript(withSegment({ startLine: 0, endLine: 4 })).ok).toBe(false);
    expect(validateTourScript(withSegment({ startLine: -3, endLine: 4 })).ok).toBe(false);
  });

  it('rejects fractional line numbers', () => {
    expect(validateTourScript(withSegment({ startLine: 4.5, endLine: 9 })).ok).toBe(false);
  });

  it('rejects an absolute file path', () => {
    expect(validateTourScript(withSegment({ file: '/etc/passwd' })).ok).toBe(false);
    expect(validateTourScript(withSegment({ file: 'C:\\Windows\\system.ini' })).ok).toBe(false);
  });

  it('rejects a path that escapes the repository', () => {
    const result = validateTourScript(withSegment({ file: '../../../.ssh/id_rsa' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('outside the repository');
    }
  });

  it('rejects empty narration', () => {
    expect(validateTourScript(withSegment({ narration: '' })).ok).toBe(false);
  });

  it('rejects missing top-level fields', () => {
    expect(validateTourScript({ version: 1, segments: [validSegment] }).ok).toBe(false);
  });

  it('rejects values that are not objects at all', () => {
    for (const input of [null, undefined, 'a tour', 42, []]) {
      expect(validateTourScript(input).ok).toBe(false);
    }
  });

  it('names the offending path so the message can be fed back to the model', () => {
    const result = validateTourScript(withSegment({ startLine: 0, endLine: 4 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.startsWith('segments.0.startLine'))).toBe(true);
    }
  });
});
