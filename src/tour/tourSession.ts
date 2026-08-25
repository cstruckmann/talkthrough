import * as vscode from 'vscode';
import { EditorChoreographer } from './choreographer.js';
import type { TourScript } from './schema.js';
import {
  currentSegment,
  initialTourState,
  isActive,
  tourReducer,
  type TourAction,
  type TourState,
} from './tourState.js';

/** Drives palette and status-bar visibility while a tour is loaded. */
const CONTEXT_ACTIVE = 'talkthrough.tourActive';

/**
 * Owns the running tour: state, the editor choreography, and the temporary
 * status-bar controls that stand in until the player panel gains audio.
 */
export class TourSession implements vscode.Disposable {
  private state: TourState = initialTourState;
  private repoRoot = '';
  private warnedAboutStaleRanges = false;

  private readonly choreographer = new EditorChoreographer();
  private readonly statusItems: vscode.StatusBarItem[] = [];
  private readonly position: vscode.StatusBarItem;

  constructor(private readonly output: vscode.OutputChannel) {
    // Right-aligned, descending priority so they read left to right.
    this.statusItems.push(
      this.button('$(chevron-left)', 'talkthrough.previousSegment', 'Previous segment', 104),
    );
    this.position = this.button('', 'talkthrough.goToSegment', 'Jump to a segment', 103);
    this.statusItems.push(this.position);
    this.statusItems.push(
      this.button('$(chevron-right)', 'talkthrough.nextSegment', 'Next segment', 102),
    );
    this.statusItems.push(this.button('$(close)', 'talkthrough.stopTour', 'Stop the tour', 101));
  }

  public async start(tour: TourScript, repoRoot: string): Promise<void> {
    this.repoRoot = repoRoot;
    this.warnedAboutStaleRanges = false;

    this.output.appendLine('');
    this.output.appendLine(`▶ ${tour.title}`);
    this.output.appendLine(tour.summary);

    await this.dispatch({ type: 'start', tour });
  }

  public async dispatch(action: TourAction): Promise<void> {
    const previous = this.state;
    this.state = tourReducer(this.state, action);

    if (this.state === previous) {
      return;
    }

    if (!isActive(this.state)) {
      this.choreographer.clear();
      await this.setActiveContext(false);
      this.render();
      return;
    }

    await this.setActiveContext(true);
    this.render();
    await this.revealCurrent();
  }

  public get isRunning(): boolean {
    return isActive(this.state);
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
    this.statusItems.forEach((item) => item.dispose());
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

  private baseRefForDiff(): string {
    return vscode.workspace.getConfiguration('talkthrough').get<string>('baseRef', '') || 'HEAD';
  }

  private render(): void {
    if (!isActive(this.state)) {
      this.statusItems.forEach((item) => item.hide());
      return;
    }

    const segment = currentSegment(this.state);
    const done = this.state.status === 'done';

    this.position.text = `$(broadcast) ${this.state.index + 1}/${this.segmentCount}${
      done ? ' · done' : ''
    }`;
    this.position.tooltip = segment
      ? new vscode.MarkdownString(`**${segment.kind}** — ${segment.file}\n\n${segment.narration}`)
      : undefined;

    this.statusItems.forEach((item) => item.show());
  }

  private get segmentCount(): number {
    return isActive(this.state) ? this.state.tour.segments.length : 0;
  }

  private button(
    text: string,
    command: string,
    tooltip: string,
    priority: number,
  ): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
    item.text = text;
    item.command = command;
    item.tooltip = tooltip;
    return item;
  }

  private async setActiveContext(active: boolean): Promise<void> {
    await vscode.commands.executeCommand('setContext', CONTEXT_ACTIVE, active);
  }
}
