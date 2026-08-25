import type * as vscode from 'vscode';
import { assemblePrompt } from '../prompt/assemble.js';
import type { TourScript } from '../tour/schema.js';
import { ExecCancelledError, ExecError, run } from '../util/exec.js';
import { findOnPath } from '../util/which.js';
import { generateValidatedTour } from './generateValidated.js';
import { BackendError, type GenerateTourRequest, type TourBackend } from './types.js';

/**
 * Generation can involve a large diff and a slow model; this bound exists to
 * stop a wedged process, not to cut off normal work.
 */
const TIMEOUT_MS = 240_000;

/**
 * Flags are pinned deliberately. CLI output formats drift, and keeping the
 * invocation in one place means a drift fix is a one-line change here.
 */
const ARGS = ['-p', '--output-format', 'json'];

/**
 * Drives the user's own installed Claude CLI.
 *
 * Talkthrough never bundles, downloads or authenticates this tool. If it is not
 * on PATH and already logged in, this backend simply reports itself
 * unavailable.
 */
export class ClaudeCliBackend implements TourBackend {
  public readonly id = 'claude-cli' as const;
  public readonly label = 'Claude CLI';

  constructor(private readonly promptTemplate: string) {}

  public async isAvailable(): Promise<boolean> {
    return (await findOnPath('claude')) !== undefined;
  }

  public async generateTour(request: GenerateTourRequest): Promise<TourScript> {
    if (!(await this.isAvailable())) {
      throw new BackendError(
        'The claude CLI was not found on your PATH. Install it and sign in, or ' +
          'choose a different backend in the talkthrough.backend setting.',
        'unavailable',
      );
    }

    return generateValidatedTour(async (correction) => {
      request.onProgress?.(
        correction ? 'Asking the CLI to correct its tour…' : 'Generating the tour…',
      );

      const prompt = assemblePrompt(this.promptTemplate, {
        changeset: request.changeset,
        ...(request.transcript === undefined ? {} : { transcript: request.transcript }),
        ...(correction === undefined ? {} : { correction }),
      });

      return this.invoke(prompt, request.changeset.repoRoot, request.token);
    });
  }

  private async invoke(
    prompt: string,
    cwd: string,
    token: vscode.CancellationToken | undefined,
  ): Promise<string> {
    let stdout: string;
    try {
      // The prompt carries a whole diff, so it goes over stdin rather than argv,
      // which would overflow the command-line length limit on large changesets.
      ({ stdout } = await run('claude', ARGS, {
        cwd,
        timeoutMs: TIMEOUT_MS,
        stdin: prompt,
        ...(token ? { token } : {}),
      }));
    } catch (error) {
      if (error instanceof ExecCancelledError) {
        throw new BackendError('Tour generation was cancelled.', 'cancelled');
      }
      if (error instanceof ExecError) {
        throw new BackendError(
          `The claude CLI failed: ${error.message}`,
          'invocation-failed',
          error.stderr,
        );
      }
      throw error;
    }

    return unwrapResult(stdout);
  }
}

/**
 * `--output-format json` wraps the model's answer in a result envelope. Falling
 * back to the raw text keeps this working if that envelope ever changes shape.
 */
export function unwrapResult(stdout: string): string {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    return '';
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }

  if (typeof envelope !== 'object' || envelope === null) {
    return trimmed;
  }

  const record = envelope as Record<string, unknown>;

  if (record['is_error'] === true) {
    const detail = typeof record['result'] === 'string' ? record['result'] : trimmed;
    throw new BackendError(`The claude CLI reported an error: ${detail}`, 'invocation-failed', trimmed);
  }

  return typeof record['result'] === 'string' ? record['result'] : trimmed;
}
