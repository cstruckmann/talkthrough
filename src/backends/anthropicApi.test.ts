import { describe, expect, it } from 'vitest';
import { describeHttpError, extractText } from './anthropicApi.js';
import { BackendError } from './types.js';

const body = (value: unknown) => JSON.stringify(value);

describe('extractText', () => {
  it('returns the text of a normal response', () => {
    const raw = body({
      content: [{ type: 'text', text: '{"version":1}' }],
      stop_reason: 'end_turn',
    });

    expect(extractText(raw)).toBe('{"version":1}');
  });

  it('joins multiple text blocks', () => {
    const raw = body({
      content: [
        { type: 'text', text: '{"version"' },
        { type: 'text', text: ':1}' },
      ],
      stop_reason: 'end_turn',
    });

    expect(extractText(raw)).toBe('{"version":1}');
  });

  it('ignores thinking blocks, which adaptive thinking adds by default', () => {
    const raw = body({
      content: [
        { type: 'thinking', thinking: 'I should order the tour by concern.' },
        { type: 'text', text: '{"version":1}' },
      ],
      stop_reason: 'end_turn',
    });

    expect(extractText(raw)).toBe('{"version":1}');
  });

  it('reports a refusal with its explanation rather than parsing it as a tour', () => {
    const raw = body({
      content: [],
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', explanation: 'Declined for policy reasons.' },
    });

    expect(() => extractText(raw)).toThrow(/declined/i);
    expect(() => extractText(raw)).toThrow(/Declined for policy reasons/);
  });

  it('explains a truncated response instead of failing schema validation', () => {
    const raw = body({
      content: [{ type: 'text', text: '{"version":1,"segments":[' }],
      stop_reason: 'max_tokens',
    });

    expect(() => extractText(raw)).toThrow(/cut off/);
  });

  it('throws when the body is not JSON', () => {
    expect(() => extractText('<html>gateway error</html>')).toThrow(BackendError);
  });

  it('throws when there is no content array', () => {
    expect(() => extractText(body({ id: 'msg_1' }))).toThrow(/no content/);
  });

  it('throws when every block is non-text', () => {
    const raw = body({
      content: [{ type: 'thinking', thinking: 'hmm' }],
      stop_reason: 'end_turn',
    });

    expect(() => extractText(raw)).toThrow(/no text content/);
  });
});

describe('describeHttpError', () => {
  it('points at the key command for an auth failure', () => {
    expect(describeHttpError(401, '{}')).toContain('Set API key');
    expect(describeHttpError(403, '{}')).toContain('Set API key');
  });

  it('describes rate limiting as temporary', () => {
    expect(describeHttpError(429, '{}')).toContain('rate-limited');
  });

  it('treats 5xx as the service having trouble', () => {
    expect(describeHttpError(503, '{}')).toContain('having trouble');
  });

  it('surfaces the API error message for other 4xx responses', () => {
    const raw = JSON.stringify({ error: { message: 'max_tokens: must be >= 1' } });

    expect(describeHttpError(400, raw)).toContain('max_tokens: must be >= 1');
  });

  it('still describes a 4xx when the body carries no error message', () => {
    expect(describeHttpError(400, 'not json')).toContain('HTTP 400');
  });
});
