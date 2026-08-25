import type * as vscode from 'vscode';

/**
 * API keys live in SecretStorage and nowhere else — never in settings.json,
 * never in logs, never written to disk by this extension.
 */
export const SECRET_KEYS = {
  anthropic: 'talkthrough.anthropicApiKey',
  openai: 'talkthrough.openaiApiKey',
} as const;

export type SecretProvider = keyof typeof SECRET_KEYS;

export const PROVIDER_LABELS: Record<SecretProvider, string> = {
  anthropic: 'Anthropic API key',
  openai: 'OpenAI API key',
};

export async function getApiKey(
  secrets: vscode.SecretStorage,
  provider: SecretProvider,
): Promise<string | undefined> {
  const key = await secrets.get(SECRET_KEYS[provider]);
  return key?.trim() ? key.trim() : undefined;
}
