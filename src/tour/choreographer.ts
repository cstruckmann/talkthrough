import * as vscode from 'vscode';
import type { TourSegment } from './schema.js';
import { clampRange } from './clamp.js';

export interface RevealOptions {
  /** Absolute path of the repository the tour was generated against. */
  repoRoot: string;
  /** Show the segment in a diff against the base ref instead of the plain file. */
  diff?: { baseRef: string } | undefined;
}

export interface RevealResult {
  /** False when the file could not be opened at all. */
  shown: boolean;
  /** True when the segment's range no longer fits the file. */
  clamped: boolean;
}

/**
 * Drives the editor for one segment: opens the file, scrolls the range into
 * view and highlights it.
 *
 * The highlight is a ThemeColor rather than a literal, so it reads correctly in
 * light, dark and high-contrast themes without a per-theme table.
 */
export class EditorChoreographer implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.rangeHighlightForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

  /** Editors carrying a highlight right now, so it can be lifted again. */
  private decorated = new Set<vscode.TextEditor>();

  public async reveal(segment: TourSegment, options: RevealOptions): Promise<RevealResult> {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(options.repoRoot), segment.file);

    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch {
      // Deleted files are a legitimate part of a changeset; the narration still
      // has something to say about them, so this is not an error.
      this.clear();
      return { shown: false, clamped: false };
    }

    const { startLine, endLine, clamped } = clampRange(
      segment.startLine,
      segment.endLine,
      document.lineCount,
    );

    let editor: vscode.TextEditor | undefined;

    if (options.diff) {
      await this.openDiff(uri, segment, options.diff.baseRef);
      // The diff's right-hand side is an editor over this same document. Find
      // it and decorate that, rather than opening the plain file on top of the
      // diff that was just requested.
      editor = vscode.window.visibleTextEditors.find(
        (candidate) => candidate.document.uri.toString() === uri.toString(),
      );
    }

    editor ??= await vscode.window.showTextDocument(document, {
      preserveFocus: true,
      preview: true,
      viewColumn: vscode.ViewColumn.Active,
    });

    const range = new vscode.Range(
      new vscode.Position(startLine - 1, 0),
      new vscode.Position(endLine - 1, document.lineAt(endLine - 1).text.length),
    );

    this.clear();
    editor.setDecorations(this.decoration, [range]);
    this.decorated.add(editor);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

    return { shown: true, clamped };
  }

  /** Lifts the highlight from every editor currently carrying one. */
  public clear(): void {
    for (const editor of this.decorated) {
      editor.setDecorations(this.decoration, []);
    }
    this.decorated.clear();
  }

  public dispose(): void {
    this.clear();
    this.decoration.dispose();
  }

  private async openDiff(
    uri: vscode.Uri,
    segment: TourSegment,
    baseRef: string,
  ): Promise<void> {
    const base = uri.with({
      scheme: BASE_CONTENT_SCHEME,
      query: baseRef,
    });

    await vscode.commands.executeCommand(
      'vscode.diff',
      base,
      uri,
      `${segment.file} (${baseRef} ↔ working tree)`,
      { preserveFocus: true, preview: true },
    );
  }
}

export const BASE_CONTENT_SCHEME = 'talkthrough-base';
