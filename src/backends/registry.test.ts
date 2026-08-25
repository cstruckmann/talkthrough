import { describe, expect, it, vi } from 'vitest';
import { resolveBackend } from './registry.js';
import { BackendError, type BackendId, type TourBackend } from './types.js';

const backend = (id: BackendId, available: boolean): TourBackend => ({
  id,
  label: id,
  isAvailable: vi.fn().mockResolvedValue(available),
  generateTour: vi.fn(),
});

describe('resolveBackend', () => {
  describe('with an explicit preference', () => {
    it('returns the named backend when it is ready', async () => {
      const backends = [backend('claude-cli', true), backend('anthropic-api', true)];

      const resolved = await resolveBackend(backends, 'anthropic-api');

      expect(resolved.id).toBe('anthropic-api');
    });

    it('does not fall back silently when the named backend is not ready', async () => {
      const backends = [backend('claude-cli', true), backend('anthropic-api', false)];

      await expect(resolveBackend(backends, 'anthropic-api')).rejects.toThrow(/not ready/);
    });

    it('says so when the named backend does not exist in this version', async () => {
      const backends = [backend('claude-cli', true)];

      await expect(resolveBackend(backends, 'codex-cli')).rejects.toThrow(/not available/);
    });
  });

  describe('with auto', () => {
    it('prefers an installed CLI over an API key', async () => {
      const backends = [backend('anthropic-api', true), backend('claude-cli', true)];

      const resolved = await resolveBackend(backends, 'auto');

      expect(resolved.id).toBe('claude-cli');
    });

    it('falls back to the API backend when no CLI is available', async () => {
      const backends = [backend('claude-cli', false), backend('anthropic-api', true)];

      const resolved = await resolveBackend(backends, 'auto');

      expect(resolved.id).toBe('anthropic-api');
    });

    it('stops checking once it finds an available backend', async () => {
      const first = backend('claude-cli', true);
      const second = backend('anthropic-api', true);

      await resolveBackend([first, second], 'auto');

      expect(second.isAvailable).not.toHaveBeenCalled();
    });

    it('explains both routes when nothing is available', async () => {
      const backends = [backend('claude-cli', false), backend('anthropic-api', false)];

      const error = await resolveBackend(backends, 'auto').catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(BackendError);
      expect((error as BackendError).kind).toBe('unavailable');
      expect((error as BackendError).message).toMatch(/CLI/);
      expect((error as BackendError).message).toMatch(/API key/);
    });

    it('rejects when there are no backends at all', async () => {
      await expect(resolveBackend([], 'auto')).rejects.toBeInstanceOf(BackendError);
    });
  });
});
