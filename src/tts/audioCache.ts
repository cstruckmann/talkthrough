import * as vscode from 'vscode';
import { audioCacheKey, type CacheKeyInput } from './cacheKey.js';

/**
 * Content-addressed audio on disk, under the extension's global storage.
 *
 * Replaying a tour, or regenerating one where most narration is unchanged,
 * should be instant — that is what makes iterating on a tour bearable.
 */
export class AudioCache {
  private readonly directory: vscode.Uri;

  constructor(globalStorageUri: vscode.Uri) {
    this.directory = vscode.Uri.joinPath(globalStorageUri, 'audio');
  }

  public uriFor(input: CacheKeyInput): vscode.Uri {
    return vscode.Uri.joinPath(
      this.directory,
      `${audioCacheKey(input)}.${input.format}`,
    );
  }

  public async has(input: CacheKeyInput): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(this.uriFor(input));
      // A zero-byte file is a previous run that died mid-write; treat it as absent.
      return stat.size > 0;
    } catch {
      return false;
    }
  }

  public async write(input: CacheKeyInput, bytes: Uint8Array): Promise<vscode.Uri> {
    await vscode.workspace.fs.createDirectory(this.directory);
    const uri = this.uriFor(input);
    await vscode.workspace.fs.writeFile(uri, bytes);
    return uri;
  }

  /** Root that must be granted to the webview for it to load these files. */
  public get root(): vscode.Uri {
    return this.directory;
  }

  public async clear(): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.directory, { recursive: true });
    } catch {
      // Nothing cached yet.
    }
  }
}
