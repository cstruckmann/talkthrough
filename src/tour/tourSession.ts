import * as vscode from 'vscode';
import type { PlayerViewProvider } from '../player/playerViewProvider.js';
import type { TourSynthesizer } from '../tts/synthesizer.js';
import { TtsError } from '../tts/types.js';
import { EditorChoreographer } from './choreographer.js';
import type { TourScript, TourSegment } from './schema.js';
import {
  currentSegment,
  initialTourState,
  isActive,
  tourReducer,
  type TourAction,
  type TourState,
} from './tourState.js';

/** Drives title-bar, palette and status-bar visibility while a tour is loaded. */
const CONTEXT_ACTIVE = 'talkthrough.tourActive';

/**
 * Owns the running tour: state, the editor choreography, and the temporary
 * controls that stand in until the player panel gains audio.
 */
export class TourSession implements vscode.Disposable {
  private state: TourState = initialTourState;
  private repoRoot = '';
  private warnedAboutStaleRanges = false;

  private readonly choreographer = new EditorChoreographer();
  /**
   * Position readout only. The stepping controls live in the editor title bar,
   * which is where the user's attention already is; the status bar carries the
   * one thing a title-bar item cannot render, which is dynamic text.
   */
  private readonly position: vscode.StatusBarItem;

  private readonly stateChanged = new vscode.EventEmitter<void>();
  /** Fires whenever the tour starts, advances or stops. */
  public readonly onDidChangeState = this.stateChanged.event;

  /** Set once the player panel and synthesizer exist; absent in Phase 2 tests. */
  private player: PlayerViewProvider | undefined;
  private synthesizer: TourSynthesizer | undefined;

  constructor(private readonly output: vscode.OutputChannel) {
    this.position = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.position.command = 'talkthrough.goToSegment';
    this.position.tooltip = 'Jump to a segment';
  }

  public attachPlayer(player: PlayerViewProvider, synthesizer: TourSynthesizer): void {
    this.player = player;
    this.synthesizer = synthesizer;
  }

  public async start(tour: TourScript, repoRoot: string): Promise<void> {
    this.repoRoot = repoRoot;
    this.warnedAboutStaleRanges = false;

    this.output.appendLine('');
    this.output.appendLine(`▶ ${tour.title}`);
    this.output.appendLine(tour.summary);

    await this.dispatch({ type: 'start', tour });

    // Everything after the first segment is filled in behind the listener, so
    // playback can begin while the rest is still being spoken into files.
    void this.synthesizer?.prefetchFrom(1);
  }

  public async dispatch(action: TourAction): Promise<void> {
    const previous = this.state;
    this.state = tourReducer(this.state, action);

    if (this.state === previous) {
      return;
    }

    if (!isActive(this.state)) {
      this.choreographer.clear();
      this.player?.tourStopped();
      await this.setActiveContext(false);
      this.render();
      this.stateChanged.fire();
      return;
    }

    await this.setActiveContext(true);
    this.render();
    this.stateChanged.fire();
    await this.revealCurrent();
    await this.loadAudio(action.type === 'start');
  }

  public get isRunning(): boolean {
    return isActive(this.state);
  }

  public get segments(): readonly TourSegment[] {
    return isActive(this.state) ? this.state.tour.segments : [];
  }

  public get currentIndex(): number | undefined {
    return isActive(this.state) ? this.state.index : undefined;
  }

  public get title(): string | undefined {
    return isActive(this.state) ? this.state.tour.title : undefined;
  }

  /** Segment labels for the jump-to quick pick. */
  public get segmentPicks(): Array<vscode.QuickPickItem & { index: number }> {
    if (!isActive(this.state)) {
      return [];
    }
    return this.state.tour.segments.map((segment, index) => ({
      index,
      label: `${index + 1}. ${segment.file}`,
      description: segment.kind,
      detail: segment.narration,
      picked: index === this.state.index,
    }));
  }

  public dispose(): void {
    this.choreographer.dispose();
    this.position.dispose();
    this.stateChanged.dispose();
    void this.setActiveContext(false);
  }

  private async revealCurrent(): Promise<void> {
    const segment = currentSegment(this.state);
    if (!segment) {
      return;
    }

    const openDiff = vscode.workspace
      .getConfiguration('talkthrough')
      .get<boolean>('openDiffView', false);

    const result = await this.choreographer.reveal(segment, {
      repoRoot: this.repoRoot,
      diff: openDiff && isActive(this.state) ? { baseRef: this.baseRefForDiff() } : undefined,
    });

    this.output.appendLine('');
    this.output.appendLine(
      `[${this.state.index + 1}/${this.segmentCount}] ${segment.kind} — ${segment.file}:` +
        `${segment.startLine}-${segment.endLine}`,
    );
    this.output.appendLine(segment.narration);

    if (!result.shown) {
      void vscode.window.showInformationMessage(
        `Talkthrough: ${segment.file} is not on disk — it was probably deleted by this change.`,
      );
      return;
    }

    // Warned once per tour: a stale tour usually means many stale segments, and
    // a notification per segment would bury the tour itself.
    if (result.clamped && !this.warnedAboutStaleRanges) {
      this.warnedAboutStaleRanges = true;
      void vscode.window.showWarningMessage(
        'Talkthrough: some files have changed since this tour was generated, so the ' +
          'highlighted ranges were adjusted to fit. Re-run the command for an accurate tour.',
      );
    }
  }

  /**
   * Pushes the current segment to the player, with its audio if that already
   * exists and as soon as it does otherwise.
   *
   * `isFirst` suppresses autoplay: browser policy refuses playback that has not
   * followed a user gesture, so the opening segment always waits for the play
   * button rather than silently failing to start.
   */
  private async loadAudio(isFirst: boolean): Promise<void> {
    const segment = currentSegment(this.state);
    const player = this.player;
    if (!segment || !player) {
      return;
    }

    const index = this.state.index;
    const payload = {
      index,
      total: this.segmentCount,
      title: this.title ?? 'Talkthrough',
      file: segment.file,
      kind: segment.kind,
      narration: segment.narration,
      autoplay: !isFirst,
      done: this.state.status === 'done',
    };

    // Show the segment straight away; the audio follows when it is ready, so
    // the panel never sits blank while a voice is being synthesized.
    player.loadSegment({ ...payload, audio: undefined });

    try {
      const audio = await this.synthesizer?.audioFor(index);
      // The user may have moved on while this was being made.
      if (audio && this.state.index === index && isActive(this.state)) {
        player.loadSegment({ ...payload, audio });
      }
    } catch (error) {
      const message =
        error instanceof TtsError ? error.message : `Narration failed: ${String(error)}`;
      player.reportError(message);
      this.output.appendLine(`Talkthrough: ${message}`);
    }
  }

  private baseRefForDiff(): string {
    return vscode.workspace.getConfiguration('talkthrough').get<string>('baseRef', '') || 'HEAD';
  }

  private render(): void {
    if (!isActive(this.state)) {
      this.position.hide();
      return;
    }

    const segment = currentSegment(this.state);
    const done = this.state.status === 'done';

    this.position.text =
      `$(broadcast) ${this.state.index + 1}/${this.segmentCount}` +
      (done ? ' · done' : segment ? ` · ${segment.kind}` : '');
    this.position.tooltip = segment
      ? new vscode.MarkdownString(`**${segment.kind}** — ${segment.file}\n\n${segment.narration}`)
      : undefined;

    this.position.show();
  }

  private get segmentCount(): number {
    return isActive(this.state) ? this.state.tour.segments.length : 0;
  }

  private async setActiveContext(active: boolean): Promise<void> {
    await vscode.commands.executeCommand('setContext', CONTEXT_ACTIVE, active);
  }
}
