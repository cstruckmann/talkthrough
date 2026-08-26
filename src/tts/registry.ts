import { TtsError, type TtsEngine, type TtsEngineId } from './types.js';

export type TtsPreference = TtsEngineId | 'auto';

/**
 * Order used when the preference is `auto`.
 *
 * The offline, keyless engine wins: a tour should play with nothing configured.
 */
export const AUTO_ORDER: TtsEngineId[] = ['system', 'openai'];

export async function resolveEngine(
  engines: readonly TtsEngine[],
  preference: TtsPreference,
): Promise<TtsEngine> {
  if (preference !== 'auto') {
    const engine = engines.find((candidate) => candidate.id === preference);
    if (!engine) {
      throw new TtsError(
        `The voice "${preference}" is not available in this version of Talkthrough. ` +
          'Change the talkthrough.tts setting.',
        'unavailable',
      );
    }
    if (!(await engine.isAvailable())) {
      throw new TtsError(
        `${engine.label} is selected in the talkthrough.tts setting but is not ready to ` +
          'run. Set it up, or switch the setting to "auto".',
        'unavailable',
      );
    }
    return engine;
  }

  const ordered = [...engines].sort((a, b) => AUTO_ORDER.indexOf(a.id) - AUTO_ORDER.indexOf(b.id));
  for (const engine of ordered) {
    if (await engine.isAvailable()) {
      return engine;
    }
  }

  throw new TtsError(
    'Talkthrough has no voice available. On macOS the built-in voice is used ' +
      'automatically; elsewhere, store an OpenAI API key with "Talkthrough: Set API key".',
    'unavailable',
  );
}
