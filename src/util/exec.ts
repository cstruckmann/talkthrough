import { execFile } from 'node:child_process';
import type * as vscode from 'vscode';

export interface ExecOptions {
  cwd: string;
  timeoutMs?: number;
  /** Cancels the child process when the token fires. */
  token?: vscode.CancellationToken;
  /** Diffs can be large; default 64 MB. */
  maxBuffer?: number;
  /** Exit codes to treat as success. `git diff --no-index` exits 1 on differences. */
  allowedExitCodes?: number[];
  /** Written to the child's stdin, which is then closed. Use for large inputs
   *  that would overflow the command line. */
  stdin?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export class ExecError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly cause: NodeJS.ErrnoException,
  ) {
    super(message);
    this.name = 'ExecError';
  }
}

export class ExecCancelledError extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'ExecCancelledError';
  }
}

/**
 * Every live child, so shutdown can end them.
 *
 * A CLI backend can be mid-generation when the window closes, and an orphaned
 * agent process would keep running — and keep billing — with nothing left to
 * receive its answer.
 */
const activeChildren = new Set<ReturnType<typeof execFile>>();

/** Kills every child process this extension started. Called on deactivate. */
export function killAllChildren(): void {
  for (const child of activeChildren) {
    child.kill();
  }
  activeChildren.clear();
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Runs a command, always bounded by a timeout and always killable through a
 * CancellationToken. Never invokes a shell, so arguments need no escaping.
 */
export function run(command: string, args: string[], options: ExecOptions): Promise<ExecResult> {
  const controller = new AbortController();
  const cancelSubscription = options.token?.onCancellationRequested(() => {
    controller.abort();
  });

  return new Promise<ExecResult>((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
        signal: controller.signal,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr });
          return;
        }
        if (options.token?.isCancellationRequested) {
          reject(new ExecCancelledError());
          return;
        }
        const err = error as NodeJS.ErrnoException;
        if (typeof err.code === 'number' && options.allowedExitCodes?.includes(err.code)) {
          resolve({ stdout, stderr });
          return;
        }
        if (err.code === 'ENOENT') {
          reject(new ExecError(`${command} was not found on your PATH.`, stderr, err));
          return;
        }
        if (err.name === 'AbortError') {
          reject(new ExecCancelledError());
          return;
        }
        reject(
          new ExecError(
            `${command} ${args.join(' ')} failed: ${stderr.trim() || err.message}`,
            stderr,
            err,
          ),
        );
      },
    );

    activeChildren.add(child);
    child.on('close', () => activeChildren.delete(child));

    if (options.stdin !== undefined) {
      child.stdin?.on('error', () => {
        // The child may exit before reading its input; the exit code tells the
        // real story, so a broken pipe here is not worth surfacing.
      });
      child.stdin?.end(options.stdin);
    }
  }).finally(() => {
    cancelSubscription?.dispose();
  });
}
