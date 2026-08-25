import { describe, expect, it } from 'vitest';
import { extractJson } from './extractJson.js';

describe('extractJson', () => {
  it('returns bare JSON unchanged', () => {
    expect(extractJson('{"version":1}')).toBe('{"version":1}');
  });

  it('unwraps a fenced json block', () => {
    const raw = '```json\n{"version": 1}\n```';

    expect(extractJson(raw)).toBe('{"version": 1}');
  });

  it('unwraps a fence with no language tag', () => {
    expect(extractJson('```\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('drops conversational preamble and trailing chatter', () => {
    const raw = 'Sure! Here is the tour:\n{"version": 1}\nLet me know if you want changes.';

    expect(extractJson(raw)).toBe('{"version": 1}');
  });

  it('keeps nested objects intact', () => {
    const raw = '{"segments":[{"id":"seg-1","nested":{"deep":true}}]}';

    expect(extractJson(raw)).toBe(raw);
  });

  it('ignores braces inside string values', () => {
    const raw = '{"narration":"the handler returns {ok: true} on success"}';

    expect(extractJson(raw)).toBe(raw);
  });

  it('ignores escaped quotes inside strings', () => {
    const raw = '{"narration":"it prints \\"done\\" and exits"}';

    expect(extractJson(raw)).toBe(raw);
  });

  it('returns undefined when there is no object at all', () => {
    expect(extractJson('I could not generate a tour.')).toBeUndefined();
  });

  it('returns undefined for empty or whitespace-only output', () => {
    expect(extractJson('')).toBeUndefined();
    expect(extractJson('   \n  ')).toBeUndefined();
  });

  it('returns undefined when the object is never closed', () => {
    expect(extractJson('{"version": 1, "segments": [')).toBeUndefined();
  });
});
