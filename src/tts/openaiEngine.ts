import type * as vscode from 'vscode';
import { getApiKey } from '../secrets.js';
import { TtsError, type SynthesisRequest, type TtsEngine } from './types.js';

const ENDPOINT = 'https://api.openai.com/v1/audio/speech';

/**
 * Pinned deliberately, and the most conservative choice available: newer
 * speech models generally sound better and are worth moving to once verified
 * against a live key, but a model name that does not exist fails at the point
 * the user presses play.
 */
const MODEL = 'tts-1';
const DEFAULT_VOICE = 'alloy';

/** Premium narration through the user's own key. Never bundled, never ours. */
export class OpenAiTtsEngine implements TtsEngine {
  public readonly id = 'openai' as const;
  public readonly label = 'OpenAI speech';
  public readonly format = 'mp3' as const;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  public async isAvailable(): Promise<boolean> {
    return (await getApiKey(this.secrets, 'openai')) !== undefined;
  }

  public async synthesize(request: SynthesisRequest): Promise<Uint8Array> {
    const apiKey = await getApiKey(this.secrets, 'openai');
    if (apiKey === undefined) {
      throw new TtsError(
        'No OpenAI API key is stored. Run "Talkthrough: Set API key" to add one.',
        'unavailable',
      );
    }

    const controller = new AbortController();
    const subscription = request.token?.onCancellationRequested(() => controller.abort());

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: request.text,
          voice: request.voice || DEFAULT_VOICE,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new TtsError(describeSpeechError(response.status, detail), 'synthesis-failed', detail);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());

      if (request.token?.isCancellationRequested) {
        throw new TtsError('Narration was cancelled.', 'cancelled');
      }

      return bytes;
    } catch (error) {
      if (error instanceof TtsError) {
        throw error;
      }
      if (request.token?.isCancellationRequested) {
        throw new TtsError('Narration was cancelled.', 'cancelled');
      }
      throw new TtsError(
        `Could not reach the OpenAI speech API: ${(error as Error).message}`,
        'synthesis-failed',
      );
    } finally {
      subscription?.dispose();
    }
  }
}

export function describeSpeechError(status: number, body: string): string {
  switch (status) {
    case 401:
    case 403:
      return 'Your OpenAI API key was rejected. Run "Talkthrough: Set API key" to update it.';
    case 429:
      return 'The OpenAI speech API rate-limited this request. Wait a moment and try again.';
    default: {
      if (status >= 500) {
        return `The OpenAI speech API is having trouble (HTTP ${status}). Try again shortly.`;
      }
      const detail = readErrorMessage(body);
      return `The OpenAI speech API rejected the request (HTTP ${status})${
        detail ? `: ${detail}` : ''
      }.`;
    }
  }
}

function readErrorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    return typeof parsed.error?.message === 'string' ? parsed.error.message : undefined;
  } catch {
    return undefined;
  }
}
