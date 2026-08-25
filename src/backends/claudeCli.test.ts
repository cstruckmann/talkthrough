import { describe, expect, it } from 'vitest';
import { unwrapResult } from './claudeCli.js';
import { BackendError } from './types.js';

describe('unwrapResult', () => {
  it('pulls the model text out of the result envelope', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '{"version":1}',
    });

    expect(unwrapResult(stdout)).toBe('{"version":1}');
  });

  it('throws with the reported detail when the CLI signals an error', () => {
    const stdout = JSON.stringify({ is_error: true, result: 'usage limit reached' });

    expect(() => unwrapResult(stdout)).toThrow(BackendError);
    expect(() => unwrapResult(stdout)).toThrow(/usage limit reached/);
  });

  it('falls back to raw stdout when the output is not JSON', () => {
    expect(unwrapResult('{"version":1}\n')).toBe('{"version":1}');
    expect(unwrapResult('plain text answer')).toBe('plain text answer');
  });

  it('falls back to raw stdout when the envelope has no result field', () => {
    const stdout = JSON.stringify({ type: 'result', session_id: 'abc' });

    expect(unwrapResult(stdout)).toBe(stdout);
  });

  it('falls back when the envelope is a JSON value that is not an object', () => {
    expect(unwrapResult('"just a string"')).toBe('"just a string"');
    expect(unwrapResult('null')).toBe('null');
  });

  it('returns empty string for empty output', () => {
    expect(unwrapResult('   \n ')).toBe('');
  });
});
