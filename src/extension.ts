import * as vscode from 'vscode';
import { explainChanges } from './commands/explainChanges.js';
import { selectVoice } from './commands/selectVoice.js';
import { promptForApiKey } from './commands/setApiKey.js';
import { PlayerViewProvider } from './player/playerViewProvider.js';
import { BaseContentProvider } from './tour/baseContentProvider.js';
import { registerSegmentsView } from './tour/segmentsView.js';
import { TourSession } from './tour/tourSession.js';
import { OpenAiTtsEngine } from './tts/openaiEngine.js';
import { resolveEngine, type TtsPreference } from './tts/registry.js';
import { SystemTtsEngine } from './tts/systemEngine.js';
import { TourSynthesizer } from './tts/synthesizer.js';
import type { TtsEngine } from './tts/types.js';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Talkthrough');
  const session = new TourSession(output);

  const engines: TtsEngine[] = [new SystemTtsEngine(), new OpenAiTtsEngine(context.secrets)];
  const synthesizer = new TourSynthesizer(
    context.globalStorageUri,
    engines[0] as TtsEngine,
    voiceSetting(),
  );

  const player = new PlayerViewProvider(context.extensionUri, synthesizer.audioRoot);
  session.attachPlayer(player, synthesizer);

  context.subscriptions.push(
    output,
    session,
    synthesizer,
    player,
    registerSegmentsView(session),

    synthesizer.onDidProgress(({ ready, total }) => player.reportProgress(ready, total)),

    // The panel owns playback and reports what the audio element did; the host
    // decides what that means for the tour.
    player.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'ended':
        case 'next':
          void session.dispatch({ type: 'next' });
          break;
        case 'previous':
          void session.dispatch({ type: 'previous' });
          break;
        case 'stop':
          void session.dispatch({ type: 'stop' });
          break;
        default:
          break;
      }
    }),

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
        prepareNarration: async (tour) => {
          const engine = await resolveEngine(
            engines,
            vscode.workspace
              .getConfiguration('talkthrough')
              .get<TtsPreference>('tts', 'auto'),
          );
          synthesizer.begin(tour.segments, engine, voiceSetting());
          await player.reveal();
        },
      });
    }),
    vscode.commands.registerCommand('talkthrough.setApiKey', () => {
      void promptForApiKey(context.secrets);
    }),
    vscode.commands.registerCommand('talkthrough.selectVoice', () => {
      void selectVoice();
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
    vscode.commands.registerCommand('talkthrough.goToSegmentIndex', (index: number) => {
      void session.dispatch({ type: 'goto', index });
    }),

    vscode.window.registerWebviewViewProvider(PlayerViewProvider.viewType, player, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

function voiceSetting(): string {
  return vscode.workspace.getConfiguration('talkthrough').get<string>('voice', '');
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
  // Decorations, status-bar items, the player and pending synthesis are all
  // disposed through the extension's subscriptions; child processes are bound
  // to cancellation tokens that are cancelled as part of that teardown.
}
