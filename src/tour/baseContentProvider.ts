import { dirname, relative, sep } from 'node:path';
import * as vscode from 'vscode';
import { run } from '../util/exec.js';
import { BASE_CONTENT_SCHEME } from './choreographer.js';

/**
 * Serves the base-ref version of a file so `vscode.diff` has a left-hand side.
 *
 * The ref travels in the URI query, which keeps the provider stateless and
 * means a stale tour cannot make it serve the wrong revision.
 */
export class BaseContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = BASE_CONTENT_SCHEME;

  public async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const baseRef = uri.query || 'HEAD';
    const filePath = uri.with({ scheme: 'file', query: '' }).fsPath;

    try {
      const { stdout: root } = await run('git', ['rev-parse', '--show-toplevel'], {
        cwd: dirname(filePath),
        token,
      });
      const repoRoot = root.trim();
      const relativePath = relative(repoRoot, filePath).split(sep).join('/');

      const { stdout } = await run('git', ['show', `${baseRef}:${relativePath}`], {
        cwd: repoRoot,
        token,
      });
      return stdout;
    } catch {
      // The file did not exist at the base ref — a newly added file. An empty
      // left-hand side renders it as wholly new, which is exactly right.
      return '';
    }
  }
}
