import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { encodeProjectPath, parseSessionLog, renderTranscript } from './sessionLog.js';

/** Transcripts are context, not the subject; this bounds their share of the prompt. */
const MAX_TRANSCRIPT_CHARS = 12_000;

/**
 * Finds the most recent agent session for a workspace and renders it.
 *
 * Every failure here returns undefined rather than throwing. The transcript is
 * an enrichment: a tour without it is the normal case, and a missing or
 * unreadable session log must never be the reason a tour fails to generate.
 */
export async function loadAgentTranscript(
  workspacePath: string,
  home: string = homedir(),
): Promise<string | undefined> {
  try {
    const directory = join(home, '.claude', 'projects', encodeProjectPath(workspacePath));
    const entries = await readdir(directory);
    const logs = entries.filter((entry) => entry.endsWith('.jsonl'));

    if (logs.length === 0) {
      return undefined;
    }

    const withTimes = await Promise.all(
      logs.map(async (name) => {
        const path = join(directory, name);
        return { path, modified: (await stat(path)).mtimeMs };
      }),
    );

    const newest = withTimes.sort((a, b) => b.modified - a.modified)[0];
    if (!newest) {
      return undefined;
    }

    const turns = parseSessionLog(await readFile(newest.path, 'utf8'));
    if (turns.length === 0) {
      return undefined;
    }

    const transcript = renderTranscript(turns, MAX_TRANSCRIPT_CHARS);
    return transcript.trim() === '' ? undefined : transcript;
  } catch {
    return undefined;
  }
}
