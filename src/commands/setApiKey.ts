import * as vscode from 'vscode';
import { PROVIDER_LABELS, SECRET_KEYS, type SecretProvider } from '../secrets.js';

/**
 * Prompts for an API key and stores it in SecretStorage. Returns the provider
 * that was set, or undefined if the user backed out.
 */
export async function promptForApiKey(
  secrets: vscode.SecretStorage,
): Promise<SecretProvider | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: PROVIDER_LABELS.anthropic, provider: 'anthropic' as const },
      { label: PROVIDER_LABELS.openai, provider: 'openai' as const },
    ],
    { placeHolder: 'Which API key do you want to store?' },
  );

  if (!picked) {
    return undefined;
  }

  const value = await vscode.window.showInputBox({
    title: `Talkthrough: ${PROVIDER_LABELS[picked.provider]}`,
    prompt: 'Stored in VS Code SecretStorage. Leave empty to remove a stored key.',
    password: true,
    ignoreFocusOut: true,
  });

  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    await secrets.delete(SECRET_KEYS[picked.provider]);
    void vscode.window.showInformationMessage(
      `Talkthrough: removed the stored ${PROVIDER_LABELS[picked.provider]}.`,
    );
    return picked.provider;
  }

  await secrets.store(SECRET_KEYS[picked.provider], trimmed);
  void vscode.window.showInformationMessage(
    `Talkthrough: stored your ${PROVIDER_LABELS[picked.provider]}.`,
  );
  return picked.provider;
}
