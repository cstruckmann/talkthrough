import { describe, expect, it } from 'vitest';
import { SystemTtsEngine } from './systemEngine.js';
import { TtsError } from './types.js';

describe('SystemTtsEngine', () => {
  it('is available on macOS', async () => {
    await expect(new SystemTtsEngine('darwin').isAvailable()).resolves.toBe(true);
  });

  it('is unavailable on Windows and Linux, rather than failing at playback', async () => {
    await expect(new SystemTtsEngine('win32').isAvailable()).resolves.toBe(false);
    await expect(new SystemTtsEngine('linux').isAvailable()).resolves.toBe(false);
  });

  it('points the user at the API voice when there is no system voice', async () => {
    const engine = new SystemTtsEngine('linux');

    const error = await engine
      .synthesize({ text: 'hello', voice: '' })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TtsError);
    expect((error as TtsError).kind).toBe('unavailable');
    expect((error as TtsError).message).toMatch(/talkthrough\.tts/);
  });
});
