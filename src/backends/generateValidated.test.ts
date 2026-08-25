import { describe, expect, it, vi } from 'vitest';
import { generateValidatedTour } from './generateValidated.js';
import { BackendError } from './types.js';

const validTour = {
  version: 1,
  title: 'Add rate limiting',
  summary: 'An overview.',
  segments: [
    {
      id: 'seg-1',
      file: 'src/client.ts',
      startLine: 1,
      endLine: 10,
      narration: 'The client gained a rate limiter.',
      kind: 'change',
    },
  ],
};

const validJson = JSON.stringify(validTour);

describe('generateValidatedTour', () => {
  it('returns the tour on a first-attempt success', async () => {
    const send = vi.fn().mockResolvedValue(validJson);

    const tour = await generateValidatedTour(send);

    expect(tour.title).toBe('Add rate limiting');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(undefined);
  });

  it('accepts output wrapped in a code fence without spending the retry', async () => {
    const send = vi.fn().mockResolvedValue('```json\n' + validJson + '\n```');

    await expect(generateValidatedTour(send)).resolves.toBeDefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries once with the validation errors when the tour is invalid', async () => {
    const invalid = JSON.stringify({ ...validTour, segments: [] });
    const send = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(validJson);

    const tour = await generateValidatedTour(send);

    expect(tour.segments).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);

    const correction = send.mock.calls[1]?.[0] as string;
    expect(correction).toContain('rejected');
    expect(correction).toContain('at least one segment');
  });

  it('tells the model when the response held no JSON', async () => {
    const send = vi.fn().mockResolvedValueOnce('I cannot do that.').mockResolvedValueOnce(validJson);

    await generateValidatedTour(send);

    expect(send.mock.calls[1]?.[0]).toContain('no JSON object');
  });

  it('tells the model when the JSON was malformed', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce('{"version": 1, "title": }')
      .mockResolvedValueOnce(validJson);

    await generateValidatedTour(send);

    expect(send.mock.calls[1]?.[0]).toContain('could not be parsed');
  });

  it('gives up after exactly one retry', async () => {
    const send = vi.fn().mockResolvedValue('not a tour');

    await expect(generateValidatedTour(send)).rejects.toBeInstanceOf(BackendError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('carries the last raw response on the failure for debugging', async () => {
    const send = vi.fn().mockResolvedValue('still not a tour');

    await expect(generateValidatedTour(send)).rejects.toMatchObject({
      kind: 'invalid-output',
      detail: 'still not a tour',
    });
  });

  it('propagates a transport failure rather than retrying it', async () => {
    const send = vi.fn().mockRejectedValue(new Error('connection reset'));

    await expect(generateValidatedTour(send)).rejects.toThrow('connection reset');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
