import type * as vscode from 'vscode';
import { assemblePrompt } from '../prompt/assemble.js';
import type { TourScript } from '../tour/schema.js';
import { ExecCancelledError, ExecError, run } from '../util/exec.js';
import { findOnPath } from '../util/which.js';
import { generateValidatedTour } from './generateValidated.js';
import {
  BackendError,
  type CompleteOptions,
  type GenerateTourRequest,
  type TourBackend,
} from './types.js';

const TIMEOUT_MS = 240_000;

/**
 * Pinned deliberately, and kept minimal.
 *
 * `--skip-git-repo-check` matters because the prompt already carries the diff:
 * the CLI does not need to be standing in the repository to write about it.
 */
const ARGS = ['exec', '--skip-git-repo-check', '-'];

/**
 * Drives the user's own installed Codex CLI.
 *
 * As with the other CLI backend, Talkthrough never bundles, downloads or
 * authenticates this tool; it only invokes what the user installed and signed
 * into themselves.
 */
export class CodexCliBackend implements TourBackend {
  public readonly id = 'codex-cli' as const;
  public readonly label = 'Codex CLI';

  constructor(private readonly promptTemplate: string) {}

  public async isAvailable(): Promise<boolean> {
    return (await findOnPath('codex')) !== undefined;
  }

  public async complete(prompt: string, options: CompleteOptions): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new BackendError(this.missingMessage(), 'unavailable');
    }
    return this.invoke(prompt, process.cwd(), options.token);
  }

  public async generateTour(request: GenerateTourRequest): Promise<TourScript> {
    if (!(await this.isAvailable())) {
      throw new BackendError(this.missingMessage(), 'unavailable');
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

  private missingMessage(): string {
    return (
      'The codex CLI was not found on your PATH. Install it and sign in, or ' +
      'choose a different backend in the talkthrough.backend setting.'
    );
  }

  private async invoke(
    prompt: string,
    cwd: string,
    token: vscode.CancellationToken | undefined,
  ): Promise<string> {
    try {
      const { stdout } = await run('codex', ARGS, {
        cwd,
        timeoutMs: TIMEOUT_MS,
        // The prompt carries a whole diff, so it goes over stdin rather than
        // argv, which would overflow the argument length limit.
        stdin: prompt,
        ...(token ? { token } : {}),
      });

      return cleanCliOutput(stdout);
    } catch (error) {
      if (error instanceof ExecCancelledError) {
        throw new BackendError('Tour generation was cancelled.', 'cancelled');
      }
      if (error instanceof ExecError) {
        throw new BackendError(
          `The codex CLI failed: ${error.message}`,
          'invocation-failed',
          error.stderr,
        );
      }
      throw error;
    }
  }
}

/**
 * Strips terminal decoration from CLI output.
 *
 * Agent CLIs write progress to the same stream as their answer and colour it,
 * and those formats change between releases. Rather than pinning to one, the
 * noise is removed and the JSON is recovered from whatever is left — the
 * validation layer downstream is what actually decides if the answer is good.
 */
export function cleanCliOutput(stdout: string): string {
  return (
    stdout
      // CSI sequences: ESC [ ... final-byte. The ESC is required — matching a
      // bare "[" would eat the opening bracket of every JSON array.
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      // OSC sequences: ESC ] ... terminated by BEL or ST.
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
      // Carriage returns drive in-place progress lines; keep the text, drop the
      // overwrite semantics.
      .replace(/\r/g, '\n')
      .trim()
  );
}
