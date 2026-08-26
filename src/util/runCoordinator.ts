import * as vscode from 'vscode';

/**
 * Ensures only one tour is being generated at a time.
 *
 * Starting a second tour while the first is still running would leave two
 * generations racing to hand the session a script, and the loser's work is
 * wasted spend on a CLI or an API. Beginning a run cancels the one before it.
 */
export class RunCoordinator implements vscode.Disposable {
  private current: vscode.CancellationTokenSource | undefined;

  /** Cancels any run in flight and returns the token source for the new one. */
  public begin(): vscode.CancellationTokenSource {
    this.cancel();
    this.current = new vscode.CancellationTokenSource();
    return this.current;
  }

  public cancel(): void {
    this.current?.cancel();
    this.current?.dispose();
    this.current = undefined;
  }

  public dispose(): void {
    this.cancel();
  }
}

/**
 * Cancels `target` when `source` is cancelled.
 *
 * The progress notification owns the user-facing cancel button, while the
 * coordinator owns the lifetime; this joins the two so either can end the run.
 */
export function linkCancellation(
  source: vscode.CancellationToken,
  target: vscode.CancellationTokenSource,
): vscode.Disposable {
  if (source.isCancellationRequested) {
    target.cancel();
    return { dispose: () => undefined };
  }
  return source.onCancellationRequested(() => target.cancel());
}
