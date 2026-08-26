import { describe, expect, it, vi } from 'vitest';
import { resolveEngine } from './registry.js';
import { TtsError, type TtsEngine, type TtsEngineId } from './types.js';

const engine = (id: TtsEngineId, available: boolean): TtsEngine => ({
  id,
  label: id,
  format: id === 'system' ? 'wav' : 'mp3',
  isAvailable: vi.fn().mockResolvedValue(available),
  synthesize: vi.fn(),
});

describe('resolveEngine', () => {
  it('prefers the offline system voice, so a tour plays with nothing configured', async () => {
    const engines = [engine('openai', true), engine('system', true)];

    expect((await resolveEngine(engines, 'auto')).id).toBe('system');
  });

  it('falls back to the API voice where the system one is unavailable', async () => {
    const engines = [engine('system', false), engine('openai', true)];

    expect((await resolveEngine(engines, 'auto')).id).toBe('openai');
  });

  it('returns an explicitly chosen engine', async () => {
    const engines = [engine('system', true), engine('openai', true)];

    expect((await resolveEngine(engines, 'openai')).id).toBe('openai');
  });

  it('does not fall back silently from an explicit choice', async () => {
    const engines = [engine('system', true), engine('openai', false)];

    await expect(resolveEngine(engines, 'openai')).rejects.toThrow(/not ready/);
  });

  it('explains both routes when no voice is available', async () => {
    const engines = [engine('system', false), engine('openai', false)];
    const error = await resolveEngine(engines, 'auto').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TtsError);
    expect((error as TtsError).kind).toBe('unavailable');
    expect((error as TtsError).message).toMatch(/macOS/);
    expect((error as TtsError).message).toMatch(/Set API key/);
  });

  it('stops checking once it finds an available engine', async () => {
    const first = engine('system', true);
    const second = engine('openai', true);

    await resolveEngine([first, second], 'auto');

    expect(second.isAvailable).not.toHaveBeenCalled();
  });
});
