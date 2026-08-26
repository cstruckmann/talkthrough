import { createHash } from 'node:crypto';
import type { AudioFormat, TtsEngineId } from './types.js';

export interface CacheKeyInput {
  text: string;
  voice: string;
  engineId: TtsEngineId;
  format: AudioFormat;
}

/**
 * Content address for a piece of narration.
 *
 * Every input that changes the audio is folded in, so editing one segment's
 * narration re-synthesizes only that segment while the rest of the tour
 * replays instantly. Fields are length-prefixed so moving a character across a
 * boundary cannot produce the same digest.
 */
export function audioCacheKey(input: CacheKeyInput): string {
  const hash = createHash('sha256');

  for (const part of [input.engineId, input.voice, input.format, input.text]) {
    hash.update(String(part.length));
    hash.update(' ');
    hash.update(part);
  }

  return hash.digest('hex').slice(0, 32);
}
