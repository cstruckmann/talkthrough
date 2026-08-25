import * as vscode from 'vscode';
import { explainChanges } from './commands/explainChanges.js';
import { promptForApiKey } from './commands/setApiKey.js';
import { PlayerViewProvider } from './player/playerViewProvider.js';
import { BaseContentProvider } from './tour/baseContentProvider.js';
import { TourSession } from './tour/tourSession.js';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Talkthrough');
  const session = new TourSession(output);

  context.subscriptions.push(
    output,
    session,

    vscode.workspace.registerTextDocumentContentProvider(
      BaseContentProvider.scheme,
      new BaseContentProvider(),
    ),

    vscode.commands.registerCommand('talkthrough.explainChanges', () => {
      void explainChanges({
        extensionUri: context.extensionUri,
        secrets: context.secrets,
        output,
        session,
      });
    }),
    vscode.commands.registerCommand('talkthrough.setApiKey', () => {
      void promptForApiKey(context.secrets);
    }),

    vscode.commands.registerCommand('talkthrough.nextSegment', () => {
      void session.dispatch({ type: 'next' });
    }),
    vscode.commands.registerCommand('talkthrough.previousSegment', () => {
      void session.dispatch({ type: 'previous' });
    }),
    vscode.commands.registerCommand('talkthrough.stopTour', () => {
      void session.dispatch({ type: 'stop' });
    }),
    vscode.commands.registerCommand('talkthrough.goToSegment', () => {
      void goToSegment(session);
    }),

    vscode.window.registerWebviewViewProvider(
      PlayerViewProvider.viewType,
      new PlayerViewProvider(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
}

async function goToSegment(session: TourSession): Promise<void> {
  if (!session.isRunning) {
    void vscode.window.showInformationMessage('Talkthrough: no tour is running.');
    return;
  }

  const picked = await vscode.window.showQuickPick(session.segmentPicks, {
    placeHolder: 'Jump to a segment',
    matchOnDetail: true,
  });

  if (picked) {
    await session.dispatch({ type: 'goto', index: picked.index });
  }
}

export function deactivate(): void {
  // Decorations, status-bar items and the tour session are disposed through
  // the extension's subscriptions; child processes are bound to cancellation
  // tokens that VS Code cancels as their progress notifications close.
}
