/**
 * Encodes a workspace path the way agent session logs are filed.
 *
 * Directory separators become hyphens, so `/Users/me/code/app` is stored as
 * `-Users-me-code-app`. Verified against real session directories.
 */
export function encodeProjectPath(workspacePath: string): string {
  return workspacePath.replace(/[/\\]/g, '-');
}

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Extracts the readable conversation from a session log.
 *
 * Only the prose is kept. Tool calls, attachments, file snapshots and the
 * various bookkeeping records are dropped: the point of this is the agent's
 * account of *why* it did something, which the diff cannot show, and none of
 * that machinery carries any.
 *
 * Malformed lines are skipped rather than thrown on — a session log is being
 * appended to while it is read, so the last line is routinely half-written.
 */
export function parseSessionLog(contents: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];

  for (const line of contents.split('\n')) {
    if (line.trim() === '') {
      continue;
    }

    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const entry = record as {
      type?: unknown;
      isSidechain?: unknown;
      message?: { role?: unknown; content?: unknown };
    };

    if (entry.type !== 'assistant' && entry.type !== 'user') {
      continue;
    }
    // Sidechains are subagent conversations; they are about their own task.
    if (entry.isSidechain === true) {
      continue;
    }

    const text = readText(entry.message?.content);
    if (text !== '') {
      turns.push({ role: entry.type, text });
    }
  }

  return turns;
}

function readText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text.trim())
    .filter((text) => text !== '')
    .join('\n\n');
}

/**
 * Renders the turns as a transcript for the generation prompt.
 *
 * The tail is kept rather than the head: the work being narrated is the work
 * that just happened, and the opening of a long session is usually about
 * something else entirely.
 */
export function renderTranscript(turns: readonly TranscriptTurn[], maxChars: number): string {
  const blocks = turns.map(
    (turn) => `${turn.role === 'assistant' ? 'Agent' : 'Developer'}: ${turn.text}`,
  );

  let transcript = blocks.join('\n\n');
  if (transcript.length > maxChars) {
    transcript = transcript.slice(transcript.length - maxChars);
    // Do not begin mid-sentence; start at the next turn boundary if there is one.
    const boundary = transcript.indexOf('\n\n');
    if (boundary !== -1) {
      transcript = transcript.slice(boundary + 2);
    }
  }

  return transcript;
}
