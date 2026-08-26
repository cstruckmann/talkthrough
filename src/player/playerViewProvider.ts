import * as vscode from 'vscode';
import {
  PLAYBACK_RATES,
  type HostToWebview,
  type PlayerErrorAction,
  type WebviewToHost,
} from '../protocol.js';
import { splitSentences } from './sentences.js';

export interface SegmentPayload {
  index: number;
  total: number;
  title: string;
  file: string;
  kind: 'overview' | 'change' | 'reasoning' | 'caveat';
  narration: string;
  /** Audio on disk, absent while the segment is still being synthesized. */
  audio?: vscode.Uri | undefined;
  autoplay: boolean;
}

/**
 * The player panel. Renders the transport and forwards what the audio element
 * did back to the host, which owns tour position.
 */
export class PlayerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'talkthrough.player';

  private view: vscode.WebviewView | undefined;
  /** Replayed into the panel when it is first shown, or shown again. */
  private lastSegment: SegmentPayload | undefined;

  private readonly received = new vscode.EventEmitter<WebviewToHost>();
  public readonly onDidReceiveMessage = this.received.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly audioRoot: vscode.Uri,
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media'), this.audioRoot],
    };
    webviewView.webview.html = this.render(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewToHost) => {
      // The panel can be created after a tour has already started — for
      // instance the user opens it halfway through — so replay the current
      // segment into it rather than showing an empty player.
      if (message.type === 'ready' && this.lastSegment) {
        this.loadSegment(this.lastSegment);
        return;
      }
      this.received.fire(message);
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  public loadSegment(payload: SegmentPayload): void {
    this.lastSegment = payload;

    const audioSrc = payload.audio ? this.view?.webview.asWebviewUri(payload.audio) : undefined;

    this.post({
      type: 'loadSegment',
      index: payload.index,
      total: payload.total,
      title: payload.title,
      file: payload.file,
      kind: payload.kind,
      narration: payload.narration,
      // Split host-side so the transcript and click-to-seek share one tested
      // implementation rather than the webview carrying a second parser.
      sentences: splitSentences(payload.narration),
      ...(audioSrc ? { audioSrc: audioSrc.toString() } : {}),
      autoplay: payload.autoplay,
    });
  }

  public reportProgress(ready: number, total: number): void {
    this.post({ type: 'synthesisProgress', ready, total });
  }

  public reportError(message: string): void {
    this.post({ type: 'error', message });
  }

  /** Replaces the panel contents with a failure the user can act on. */
  public showError(title: string, detail: string, actions: PlayerErrorAction[] = []): void {
    this.lastSegment = undefined;
    this.post({ type: 'showError', title, detail, actions });
  }

  /** The tour ran to its end; the panel stops without clearing itself. */
  public tourFinished(): void {
    this.post({ type: 'tourFinished' });
  }

  public tourStopped(): void {
    this.lastSegment = undefined;
    this.post({ type: 'tourStopped' });
  }

  /**
   * Brings the panel forward, so a started tour is visible without hunting.
   *
   * The generated focus command is used rather than `view.show`, because a
   * panel the user has never opened has no resolved view to show.
   */
  public async reveal(): Promise<void> {
    if (this.view) {
      this.view.show(true);
      return;
    }
    await vscode.commands.executeCommand(`${PlayerViewProvider.viewType}.focus`);
  }

  public dispose(): void {
    this.received.dispose();
  }

  private post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private render(webview: vscode.Webview): string {
    const asset = (name: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', name));
    const nonce = createNonce();

    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `img-src ${webview.cspSource}`,
      `media-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    const rateOptions = PLAYBACK_RATES.map(
      (rate) =>
        `<option value="${rate}"${rate === 1 ? ' selected' : ''}>${rate}&times;</option>`,
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${asset('player.css')}" rel="stylesheet" />
    <title>Talkthrough</title>
  </head>
  <body>
    <div class="empty-state" id="empty">
      <h1>Talkthrough</h1>
      <p>
        Run <code>Talkthrough: Explain recent changes</code> to generate a
        narrated walkthrough of your changes.
      </p>
    </div>

    <div class="error-state" id="errorState" hidden>
      <h1 id="errorTitle"></h1>
      <p id="errorDetail"></p>
      <div class="actions" id="errorActions"></div>
    </div>

    <div class="player" id="player" hidden>
      <div class="transport">
        <button id="previous" type="button" aria-label="Previous segment" title="Previous segment">&#8249;</button>
        <button id="play" type="button" aria-label="Play" title="Play or pause">&#9654;</button>
        <button id="next" type="button" aria-label="Next segment" title="Next segment">&#8250;</button>
        <span class="position" id="position"></span>
        <span class="spacer"></span>
        <span class="time" id="time"></span>
        <label class="visually-hidden" for="rate">Playback speed</label>
        <select id="rate" title="Playback speed">${rateOptions}</select>
      </div>

      <div
        class="progress"
        id="progress"
        role="progressbar"
        aria-label="Tour progress"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-fill" id="progressFill"></div>
      </div>

      <div class="meta">
        <span class="kind" id="kind"></span>
        <span class="file" id="file"></span>
      </div>

      <p class="narration" id="narration"></p>
      <div class="status" id="status" role="status"></div>

      <audio id="audio" preload="auto"></audio>
    </div>

    <script nonce="${nonce}" src="${asset('player.js')}"></script>
  </body>
</html>`;
  }
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
