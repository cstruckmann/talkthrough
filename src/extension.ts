import * as vscode from 'vscode';
import { PlayerViewProvider } from './player/playerViewProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('talkthrough.explainChanges', () => {
      void vscode.window.showInformationMessage(
        'Talkthrough: tour generation is not wired up yet.',
      );
    }),
    vscode.window.registerWebviewViewProvider(
      PlayerViewProvider.viewType,
      new PlayerViewProvider(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
