import { describe, expect, it } from 'vitest';
import { audioCacheKey, type CacheKeyInput } from './cacheKey.js';

const base: CacheKeyInput = {
  text: 'The client gained a rate limiter.',
  voice: 'Samantha',
  engineId: 'system',
  format: 'wav',
};

describe('audioCacheKey', () => {
  it('is stable for identical input', () => {
    expect(audioCacheKey(base)).toBe(audioCacheKey({ ...base }));
  });

  it('changes when the narration changes', () => {
    expect(audioCacheKey({ ...base, text: 'Something else entirely.' })).not.toBe(
      audioCacheKey(base),
    );
  });

  it('changes when the voice changes, so a voice switch re-synthesizes', () => {
    expect(audioCacheKey({ ...base, voice: 'Daniel' })).not.toBe(audioCacheKey(base));
  });

  it('changes when the engine changes', () => {
    expect(audioCacheKey({ ...base, engineId: 'openai' })).not.toBe(audioCacheKey(base));
  });

  it('changes when the format changes', () => {
    expect(audioCacheKey({ ...base, format: 'mp3' })).not.toBe(audioCacheKey(base));
  });

  it('does not collide when text shifts across a field boundary', () => {
    // Without length prefixes these two would hash the same bytes.
    const a = audioCacheKey({ ...base, voice: 'ab', text: 'cd' });
    const b = audioCacheKey({ ...base, voice: 'a', text: 'bcd' });

    expect(a).not.toBe(b);
  });

  it('produces a filesystem-safe fixed-length name', () => {
    const key = audioCacheKey(base);

    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('handles empty voice and empty text', () => {
    expect(audioCacheKey({ ...base, voice: '', text: '' })).toMatch(/^[0-9a-f]{32}$/);
  });

  it('treats whitespace as significant, since it changes delivery', () => {
    expect(audioCacheKey({ ...base, text: `${base.text} ` })).not.toBe(audioCacheKey(base));
  });
});
