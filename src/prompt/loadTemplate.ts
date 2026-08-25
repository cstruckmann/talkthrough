import * as vscode from 'vscode';

/**
 * Reads the generation prompt from disk on every run rather than inlining it,
 * so it can be edited and re-run without rebuilding the extension.
 */
export async function loadPromptTemplate(extensionUri: vscode.Uri): Promise<string> {
  const uri = vscode.Uri.joinPath(extensionUri, 'prompts', 'tour.md');
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}
