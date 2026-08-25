/**
 * Pulls a JSON object out of model output.
 *
 * Backends are asked for bare JSON, but models routinely wrap it in a fenced
 * block or add a sentence of preamble. Recovering from that is cheaper than
 * spending the single retry on it.
 */
export function extractJson(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return undefined;
  }

  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n?```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const start = candidate.indexOf('{');
  if (start === -1) {
    return undefined;
  }

  const end = findMatchingBrace(candidate, start);
  return end === -1 ? undefined : candidate.slice(start, end + 1);
}

/** Scans for the brace closing the object at `start`, ignoring braces in strings. */
function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}
