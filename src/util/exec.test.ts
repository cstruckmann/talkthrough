import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { ExecCancelledError, ExecError, killAllChildren, run } from './exec.js';

const cwd = process.cwd();

/** A CancellationToken that can be fired on demand. */
const makeToken = () => {
  const listeners: Array<() => void> = [];
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void) => {
      listeners.push(listener);
      return { dispose: () => undefined };
    },
  };
  return {
    token: token as unknown as vscode.CancellationToken,
    cancel: () => {
      token.isCancellationRequested = true;
      listeners.forEach((listener) => listener());
    },
  };
};

describe('run', () => {
  it('returns stdout for a successful command', async () => {
    const { stdout } = await run('echo', ['hello'], { cwd });

    expect(stdout.trim()).toBe('hello');
  });

  it('writes stdin to the child', async () => {
    const { stdout } = await run('cat', [], { cwd, stdin: 'piped input' });

    expect(stdout).toBe('piped input');
  });

  it('carries input far larger than the command line limit', async () => {
    const big = 'x'.repeat(500_000);
    const { stdout } = await run('cat', [], { cwd, stdin: big });

    expect(stdout).toHaveLength(big.length);
  });

  it('rejects with a readable error for a missing command', async () => {
    const error = await run('talkthrough-no-such-binary', [], { cwd }).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(ExecError);
    expect((error as ExecError).message).toMatch(/not found on your PATH/);
  });

  it('rejects on a non-zero exit', async () => {
    await expect(run('sh', ['-c', 'exit 3'], { cwd })).rejects.toBeInstanceOf(ExecError);
  });

  it('accepts a non-zero exit that was allowed', async () => {
    const { stdout } = await run('sh', ['-c', 'echo out; exit 1'], {
      cwd,
      allowedExitCodes: [1],
    });

    expect(stdout.trim()).toBe('out');
  });

  it('stops a command that outruns its timeout', async () => {
    const started = Date.now();

    await expect(run('sleep', ['30'], { cwd, timeoutMs: 300 })).rejects.toBeInstanceOf(ExecError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('reports cancellation as cancellation, not as a failure', async () => {
    const { token, cancel } = makeToken();
    const pending = run('sleep', ['30'], { cwd, token });

    setTimeout(cancel, 50);

    await expect(pending).rejects.toBeInstanceOf(ExecCancelledError);
  });

  it('kills a still-running child on shutdown', async () => {
    const started = Date.now();
    const pending = run('sleep', ['30'], { cwd }).catch((cause: unknown) => cause);

    // Give the child a moment to actually spawn before ending it.
    await new Promise((resolve) => setTimeout(resolve, 100));
    killAllChildren();

    await pending;
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('has nothing to kill once children have finished', async () => {
    await run('echo', ['done'], { cwd });

    expect(() => killAllChildren()).not.toThrow();
  });
});
