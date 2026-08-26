import * as vscode from 'vscode';
import type { TourSegment } from './schema.js';
import type { TourSession } from './tourSession.js';

/**
 * Icons carry the segment kind at a glance, so the list reads as a shape —
 * where the reasoning is, where the caveats are — before any of it is read.
 */
const KIND_ICONS: Record<TourSegment['kind'], vscode.ThemeIcon> = {
  overview: new vscode.ThemeIcon('compass'),
  change: new vscode.ThemeIcon('diff'),
  reasoning: new vscode.ThemeIcon('lightbulb'),
  caveat: new vscode.ThemeIcon(
    'warning',
    new vscode.ThemeColor('problemsWarningIcon.foreground'),
  ),
};

export class SegmentItem extends vscode.TreeItem {
  constructor(
    public readonly index: number,
    segment: TourSegment,
    isCurrent: boolean,
  ) {
    super(segment.file, vscode.TreeItemCollapsibleState.None);

    this.id = segment.id;
    this.description = `${index + 1} · ${segment.kind}`;
    this.iconPath = KIND_ICONS[segment.kind];
    this.tooltip = new vscode.MarkdownString(
      `**${segment.kind}** — ${segment.file}:${segment.startLine}-${segment.endLine}\n\n` +
        segment.narration,
    );
    this.command = {
      command: 'talkthrough.goToSegmentIndex',
      title: 'Go to segment',
      arguments: [index],
    };
    this.contextValue = isCurrent ? 'talkthrough.currentSegment' : 'talkthrough.segment';
  }
}

/**
 * The tour as a navigable list in the sidebar: what the tour covers, in order,
 * with the current segment selected as it advances.
 */
export class SegmentsViewProvider implements vscode.TreeDataProvider<SegmentItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly session: TourSession) {}

  public getTreeItem(element: SegmentItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: SegmentItem): SegmentItem[] {
    if (element) {
      return [];
    }
    return this.session.segments.map(
      (segment, index) => new SegmentItem(index, segment, index === this.session.currentIndex),
    );
  }

  /** Flat list, but TreeView.reveal requires this to exist. */
  public getParent(): undefined {
    return undefined;
  }

  public refresh(): void {
    this.changed.fire();
  }

  public dispose(): void {
    this.changed.dispose();
  }
}

/**
 * Wires the view to the session: the list rebuilds when a tour starts or
 * stops, and the selection follows the current segment as it advances.
 */
export function registerSegmentsView(session: TourSession): vscode.Disposable {
  const provider = new SegmentsViewProvider(session);
  const view = vscode.window.createTreeView('talkthrough.segments', {
    treeDataProvider: provider,
    showCollapseAll: false,
  });

  const subscription = session.onDidChangeState(() => {
    provider.refresh();

    const index = session.currentIndex;
    if (!session.isRunning || index === undefined) {
      view.title = 'Tour';
      view.description = '';
      return;
    }

    view.title = session.title ?? 'Tour';
    view.description = `${index + 1}/${session.segments.length}`;

    // Only follow along when the user can see it happening; revealing in a
    // hidden view would silently steal the tree's selection.
    if (view.visible) {
      const item = provider.getChildren().at(index);
      if (item) {
        void view.reveal(item, { select: true, focus: false });
      }
    }
  });

  return vscode.Disposable.from(view, provider, subscription);
}
