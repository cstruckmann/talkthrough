import type * as vscode from 'vscode';
import { assemblePrompt } from '../prompt/assemble.js';
import { getApiKey } from '../secrets.js';
import type { TourScript } from '../tour/schema.js';
import { generateValidatedTour } from './generateValidated.js';
import {
  BackendError,
  type CompleteOptions,
  type GenerateTourRequest,
  type TourBackend,
} from './types.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Pinned deliberately. Claude Opus 5 runs adaptive thinking by default, which
 * is what we want for ordering a tour well, and means the response can carry
 * thinking blocks alongside the text — see extractText.
 */
const MODEL = 'claude-opus-5';

const MISSING_KEY =
  'No Anthropic API key is stored. Run "Talkthrough: Set API key" to add one.';
const MAX_TOKENS = 16_000;

/**
 * Talks to the Anthropic Messages API directly with the user's own key.
 *
 * A first-class API path matters beyond convenience: it keeps Talkthrough from
 * depending on any single auth route, per the risk noted in PROJECT.md.
 */
export class AnthropicApiBackend implements TourBackend {
  public readonly id = 'anthropic-api' as const;
  public readonly label = 'Anthropic API';

  constructor(
    private readonly promptTemplate: string,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  public async isAvailable(): Promise<boolean> {
    return (await getApiKey(this.secrets, 'anthropic')) !== undefined;
  }

  public async complete(prompt: string, options: CompleteOptions): Promise<string> {
    const apiKey = await getApiKey(this.secrets, 'anthropic');
    if (apiKey === undefined) {
      throw new BackendError(MISSING_KEY, 'unavailable');
    }
    return this.send(prompt, apiKey, options.token);
  }

  public async generateTour(request: GenerateTourRequest): Promise<TourScript> {
    const apiKey = await getApiKey(this.secrets, 'anthropic');
    if (apiKey === undefined) {
      throw new BackendError(MISSING_KEY, 'unavailable');
    }

    return generateValidatedTour(async (correction) => {
      request.onProgress?.(
        correction ? 'Asking the model to correct its tour…' : 'Generating the tour…',
      );

      const prompt = assemblePrompt(this.promptTemplate, {
        changeset: request.changeset,
        ...(request.transcript === undefined ? {} : { transcript: request.transcript }),
        ...(correction === undefined ? {} : { correction }),
      });

      return this.send(prompt, apiKey, request.token);
    });
  }

  private async send(
    prompt: string,
    apiKey: string,
    token: vscode.CancellationToken | undefined,
  ): Promise<string> {
    const controller = new AbortController();
    const subscription = token?.onCancellationRequested(() => controller.abort());

    // The subscription must outlive the body read, not just the fetch: fetch
    // resolves once the headers arrive, and a long tour is still streaming in
    // after that. Disposing early would leave cancel doing nothing for most of
    // the request's life.
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      const body = await response.text();

      if (token?.isCancellationRequested) {
        throw new BackendError('Tour generation was cancelled.', 'cancelled');
      }

      if (!response.ok) {
        throw new BackendError(
          describeHttpError(response.status, body),
          'invocation-failed',
          body,
        );
      }

      return extractText(body);
    } catch (error) {
      if (error instanceof BackendError) {
        throw error;
      }
      if (token?.isCancellationRequested) {
        throw new BackendError('Tour generation was cancelled.', 'cancelled');
      }
      throw new BackendError(
        `Could not reach the Anthropic API: ${(error as Error).message}`,
        'invocation-failed',
      );
    } finally {
      subscription?.dispose();
    }
  }
}

/**
 * Pulls the narration JSON out of a Messages API response.
 *
 * Only `text` blocks are joined: with adaptive thinking on, the response may
 * also carry `thinking` blocks, and folding those in would hand the validator
 * the model's reasoning instead of its answer.
 */
export function extractText(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new BackendError(
      'The Anthropic API returned a response that was not JSON.',
      'invocation-failed',
      body,
    );
  }

  const message = parsed as {
    content?: unknown;
    stop_reason?: unknown;
    stop_details?: { explanation?: unknown };
  };

  if (message.stop_reason === 'refusal') {
    const explanation =
      typeof message.stop_details?.explanation === 'string'
        ? ` ${message.stop_details.explanation}`
        : '';
    throw new BackendError(
      `The model declined to generate a tour for this changeset.${explanation}`,
      'invocation-failed',
      body,
    );
  }

  if (!Array.isArray(message.content)) {
    throw new BackendError(
      'The Anthropic API response contained no content.',
      'invocation-failed',
      body,
    );
  }

  const text = message.content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text)
    .join('');

  if (text.trim() === '') {
    throw new BackendError(
      'The Anthropic API returned no text content.',
      'invocation-failed',
      body,
    );
  }

  if (message.stop_reason === 'max_tokens') {
    throw new BackendError(
      'The tour was cut off before it finished. The changeset may be too large; ' +
        'try a narrower base ref.',
      'invocation-failed',
      body,
    );
  }

  return text;
}

export function describeHttpError(status: number, body: string): string {
  const detail = readErrorMessage(body);

  switch (status) {
    case 401:
    case 403:
      return 'Your Anthropic API key was rejected. Run "Talkthrough: Set API key" to update it.';
    case 429:
      return 'The Anthropic API rate-limited this request. Wait a moment and try again.';
    default:
      return status >= 500
        ? `The Anthropic API is having trouble (HTTP ${status}). Try again shortly.`
        : `The Anthropic API rejected the request (HTTP ${status})${detail ? `: ${detail}` : ''}.`;
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
