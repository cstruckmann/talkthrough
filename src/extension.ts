import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('talkthrough.explainChanges', () => {
      void vscode.window.showInformationMessage(
        'Talkthrough: tour generation is not wired up yet.',
      );
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
