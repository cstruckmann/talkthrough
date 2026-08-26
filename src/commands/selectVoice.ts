import * as vscode from 'vscode';
import { run } from '../util/exec.js';
import { parseVoiceList, rankVoices, type InstalledVoice } from '../tts/voiceList.js';

const QUALITY_LABEL: Record<InstalledVoice['quality'], string> = {
  premium: 'Premium',
  enhanced: 'Enhanced',
  compact: 'Compact',
};

interface VoiceItem extends vscode.QuickPickItem {
  voice?: InstalledVoice | undefined;
}

/**
 * Picks a system voice, previewing each one as it is highlighted.
 *
 * macOS ships compact voices by default, and they sound noticeably rough. The
 * Enhanced and Premium voices are a large improvement but have to be
 * downloaded, so the picker says so rather than leaving the user to wonder why
 * the narration sounds cheap.
 */
export async function selectVoice(): Promise<void> {
  if (process.platform !== 'darwin') {
    void vscode.window.showInformationMessage(
      'Talkthrough: choosing a system voice is macOS-only. Set talkthrough.voice ' +
        'to an OpenAI voice name such as "alloy" when using the OpenAI engine.',
    );
    return;
  }

  let voices: InstalledVoice[];
  try {
    const { stdout } = await run('say', ['-v', '?'], { cwd: process.cwd(), timeoutMs: 15_000 });
    voices = rankVoices(parseVoiceList(stdout), vscode.env.language);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Talkthrough: could not list system voices: ${(error as Error).message}`,
    );
    return;
  }

  if (voices.length === 0) {
    void vscode.window.showWarningMessage('Talkthrough: no system voices were found.');
    return;
  }

  const items: VoiceItem[] = voices.map((voice) => ({
    label: voice.name,
    description: `${voice.locale} · ${QUALITY_LABEL[voice.quality]}`,
    // Only the good voices earn a second line; compact ones would just be noise.
    ...(voice.quality === 'compact' ? {} : { detail: voice.sample }),
    voice,
  }));

  if (!voices.some((voice) => voice.quality !== 'compact')) {
    items.unshift({
      label: '$(info) Only compact voices are installed',
      description: 'Higher-quality voices are a free download',
      detail:
        'System Settings → Accessibility → Spoken Content → System Voice → Manage Voices, ' +
        'then pick an Enhanced or Premium voice. They sound dramatically better than the ' +
        'compact voices macOS ships with.',
    });
  }

  const quickPick = vscode.window.createQuickPick<VoiceItem>();
  quickPick.items = items;
  quickPick.title = 'Talkthrough: choose a narration voice';
  quickPick.placeholder = 'Highlight a voice to hear it';
  quickPick.matchOnDescription = true;

  // Previewing on highlight makes the list auditionable, which is the only way
  // to choose a voice sensibly.
  quickPick.onDidChangeActive((active) => {
    const voice = active[0]?.voice;
    if (voice) {
      void preview(voice);
    }
  });

  const picked = await new Promise<VoiceItem | undefined>((resolve) => {
    quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]));
    quickPick.onDidHide(() => resolve(undefined));
    quickPick.show();
  });
  quickPick.hide();
  quickPick.dispose();

  if (!picked?.voice) {
    return;
  }

  await vscode.workspace
    .getConfiguration('talkthrough')
    .update('voice', picked.voice.name, vscode.ConfigurationTarget.Global);

  void vscode.window.showInformationMessage(
    `Talkthrough will narrate with ${picked.voice.name}. Re-run the command to hear it; ` +
      'already-narrated segments are cached under the previous voice.',
  );
}

async function preview(voice: InstalledVoice): Promise<void> {
  try {
    await run('say', ['-v', voice.name, 'Talkthrough.'], {
      cwd: process.cwd(),
      timeoutMs: 10_000,
    });
  } catch {
    // A voice that will not speak is not worth interrupting the picker for.
  }
}
