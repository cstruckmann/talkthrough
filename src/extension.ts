import * as vscode from 'vscode';
import { explainChanges } from './commands/explainChanges.js';
import { promptForApiKey } from './commands/setApiKey.js';
import { PlayerViewProvider } from './player/playerViewProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Talkthrough');

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('talkthrough.explainChanges', () => {
      void explainChanges({
        extensionUri: context.extensionUri,
        secrets: context.secrets,
        output,
      });
    }),
    vscode.commands.registerCommand('talkthrough.setApiKey', () => {
      void promptForApiKey(context.secrets);
    }),
    vscode.window.registerWebviewViewProvider(
      PlayerViewProvider.viewType,
      new PlayerViewProvider(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
}

export function deactivate(): void {
  // Child processes are bound to a CancellationToken that VS Code cancels when
  // the progress notification closes; nothing outlives deactivation yet.
}
