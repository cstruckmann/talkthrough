import * as vscode from 'vscode';
import { AnthropicApiBackend } from '../backends/anthropicApi.js';
import { ClaudeCliBackend } from '../backends/claudeCli.js';
import { resolveBackend, type BackendPreference } from '../backends/registry.js';
import { BackendError, type TourBackend } from '../backends/types.js';
import { collectChangeset } from '../changeset/collector.js';
import { ChangesetError } from '../changeset/types.js';
import { TtsError } from '../tts/types.js';
import { loadPromptTemplate } from '../prompt/loadTemplate.js';
import type { TourScript } from '../tour/schema.js';
import type { TourSession } from '../tour/tourSession.js';
import type { PlayerViewProvider } from '../player/playerViewProvider.js';

/**
 * Per-file diff budget. Large enough to carry a substantial change in full,
 * small enough that one runaway file cannot crowd out the rest of the tour.
 */
const MAX_PATCH_LINES = 400;

export interface ExplainChangesDeps {
  extensionUri: vscode.Uri;
  secrets: vscode.SecretStorage;
  output: vscode.OutputChannel;
  session: TourSession;
  player: PlayerViewProvider;
  /** Chooses a voice and readies synthesis before the tour starts playing. */
  prepareNarration: (tour: TourScript) => Promise<void>;
}

export async function explainChanges(deps: ExplainChangesDeps): Promise<void> {
  const cwd = resolveWorkspaceFolder();
  if (!cwd) {
    void vscode.window.showErrorMessage(
      'Talkthrough needs an open folder to find your changes.',
    );
    return;
  }

  try {
    const tour = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Talkthrough',
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: 'Reading your changes…' });
        return runTour(cwd, deps, progress, token);
      },
    );

    if (!tour) {
      return;
    }

    writeToOutput(deps.output, tour);
    await deps.prepareNarration(tour);
    await deps.session.start(tour, cwd);

    const count = tour.segments.length;
    void vscode.window
      .showInformationMessage(
        `Talkthrough: "${tour.title}" — ${count} segment${count === 1 ? '' : 's'}. ` +
          'Press play in the Talkthrough panel.',
        'Show script',
      )
      .then((choice) => {
        if (choice === 'Show script') {
          deps.output.show(true);
        }
      });
  } catch (error) {
    reportError(deps, error);
  }
}

async function runTour(
  cwd: string,
  deps: ExplainChangesDeps,
  progress: vscode.Progress<{ message?: string }>,
  token: vscode.CancellationToken,
): Promise<TourScript | undefined> {
  const config = vscode.workspace.getConfiguration('talkthrough');

  const changeset = await collectChangeset({
    cwd,
    baseRef: config.get<string>('baseRef', ''),
    maxPatchLines: MAX_PATCH_LINES,
    token,
  });

  if (token.isCancellationRequested) {
    return undefined;
  }

  const template = await loadPromptTemplate(deps.extensionUri);
  const backends: TourBackend[] = [
    new ClaudeCliBackend(template),
    new AnthropicApiBackend(template, deps.secrets),
  ];

  const backend = await resolveBackend(
    backends,
    config.get<BackendPreference>('backend', 'auto'),
  );

  progress.report({ message: `Generating the tour with ${backend.label}…` });
  deps.output.appendLine(
    `Talkthrough: ${changeset.files.length} file(s) changed, ` +
      `base ${changeset.baseRef} (${changeset.mode}), backend ${backend.id}.`,
  );

  const tour = await backend.generateTour({
    changeset,
    token,
    onProgress: (message) => progress.report({ message }),
  });

  // A backend may finish despite the cancel — a CLI that had already written
  // its answer, an API response already in flight. Without this the user
  // cancels and still gets a success notification.
  return token.isCancellationRequested ? undefined : tour;
}

function resolveWorkspaceFolder(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  const folder = active
    ? vscode.workspace.getWorkspaceFolder(active)
    : vscode.workspace.workspaceFolders?.[0];

  return (folder ?? vscode.workspace.workspaceFolders?.[0])?.uri.fsPath;
}

function writeToOutput(output: vscode.OutputChannel, tour: TourScript): void {
  output.appendLine('');
  output.appendLine(JSON.stringify(tour, null, 2));
}

/**
 * Explains a failure where the user is already looking.
 *
 * The panel gets the full explanation and a way out of it; the notification is
 * kept short, because a wall of text in a toast is read by nobody.
 */
function reportError(deps: ExplainChangesDeps, error: unknown): void {
  const { output, player } = deps;

  if (error instanceof ChangesetError) {
    const guidance = CHANGESET_GUIDANCE[error.kind];
    player.showError(guidance.title, error.message, guidance.actions);

    if (error.kind === 'empty-diff') {
      void vscode.window.showInformationMessage(`Talkthrough: ${error.message}`);
      return;
    }
    void vscode.window.showErrorMessage(`Talkthrough: ${error.message}`);
    return;
  }

  if (error instanceof TtsError) {
    if (error.kind === 'cancelled') {
      return;
    }
    player.showError('Narration is not available', error.message, [
      { label: 'Set API key', command: 'talkthrough.setApiKey' },
      { label: 'Choose voice', command: 'talkthrough.selectVoice' },
    ]);
    void vscode.window.showErrorMessage(`Talkthrough: ${error.message}`);
    return;
  }

  if (error instanceof BackendError) {
    if (error.kind === 'cancelled') {
      return;
    }
    if (error.detail) {
      output.appendLine('');
      output.appendLine(`Backend output:\n${error.detail}`);
    }

    player.showError(
      error.kind === 'unavailable' ? 'No backend is ready' : 'The tour could not be generated',
      error.message,
      error.kind === 'unavailable'
        ? [{ label: 'Set API key', command: 'talkthrough.setApiKey' }]
        : [{ label: 'Show details', command: 'talkthrough.showOutput' }],
    );

    void vscode.window
      .showErrorMessage(`Talkthrough: ${error.message}`, 'Show details')
      .then((choice) => {
        if (choice === 'Show details') {
          output.show(true);
        }
      });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  output.appendLine(`Talkthrough: unexpected failure: ${message}`);
  player.showError('Something went wrong', message, [
    { label: 'Show details', command: 'talkthrough.showOutput' },
  ]);
  void vscode.window.showErrorMessage(`Talkthrough: ${message}`);
}

/** Per-failure framing, so each dead end says what to do next. */
const CHANGESET_GUIDANCE: Record<
  ChangesetError['kind'],
  { title: string; actions: Array<{ label: string; command: string }> }
> = {
  'not-a-repo': { title: 'No git repository here', actions: [] },
  'no-git': { title: 'git was not found', actions: [] },
  'empty-diff': { title: 'Nothing to explain', actions: [] },
  'bad-base-ref': {
    title: 'That base ref does not exist',
    actions: [{ label: 'Open settings', command: 'talkthrough.openSettings' }],
  },
};
