import * as vscode from 'vscode';

/**
 * Renders the Talkthrough player in the bottom panel.
 *
 * Phase 0: a static placeholder. The audio element, transcript and host
 * message protocol arrive in Phase 3.
 */
export class PlayerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'talkthrough.player';

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = this.render(webviewView.webview);
  }

  private render(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'player.css'),
    );
    const nonce = createNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `img-src ${webview.cspSource}`,
      `media-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Talkthrough</title>
  </head>
  <body>
    <div class="empty-state">
      <h1>Talkthrough</h1>
      <p>
        Run <code>Talkthrough: Explain recent changes</code> to generate a
        narrated walkthrough of your changes.
      </p>
    </div>
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
