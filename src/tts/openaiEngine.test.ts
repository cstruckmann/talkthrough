import { describe, expect, it } from 'vitest';
import { describeSpeechError } from './openaiEngine.js';

describe('describeSpeechError', () => {
  it('points at the key command for an auth failure', () => {
    expect(describeSpeechError(401, '{}')).toContain('Set API key');
    expect(describeSpeechError(403, '{}')).toContain('Set API key');
  });

  it('describes rate limiting as temporary', () => {
    expect(describeSpeechError(429, '{}')).toContain('rate-limited');
  });

  it('treats 5xx as the service having trouble', () => {
    expect(describeSpeechError(502, '{}')).toContain('having trouble');
  });

  it('surfaces the API message for other 4xx responses', () => {
    const body = JSON.stringify({ error: { message: 'Unknown model: tts-9' } });

    expect(describeSpeechError(400, body)).toContain('Unknown model: tts-9');
  });

  it('still describes a 4xx when the body is not JSON', () => {
    expect(describeSpeechError(400, '<html>')).toContain('HTTP 400');
  });
});
