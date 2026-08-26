export interface Sentence {
  text: string;
  /** Character offset of the sentence's first character within the narration. */
  start: number;
  /** Character offset one past its last character. */
  end: number;
}

/**
 * Abbreviations whose trailing period does not end a sentence.
 *
 * Narration is written to be spoken, so this list only has to cover what
 * actually shows up in prose about code, not every abbreviation in English.
 */
const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'approx',
  'fig',
  'no',
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'jr',
  'sr',
]);

/**
 * Splits narration into sentences for the transcript.
 *
 * Sentence boundaries drive both the highlight that follows playback and
 * click-to-seek, so a wrong split is visible twice. Offsets are kept rather
 * than just text because seeking maps a character position onto elapsed time.
 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char !== '.' && char !== '!' && char !== '?') {
      continue;
    }

    // Absorb any run of closing punctuation, so a quote or bracket stays with
    // the sentence it belongs to.
    let end = i + 1;
    while (end < text.length && `"'”’)]`.includes(text[end] ?? '')) {
      end++;
    }

    const next = text[end];
    if (next !== undefined && !/\s/.test(next)) {
      continue;
    }

    if (char === '.' && endsWithAbbreviation(text.slice(start, i))) {
      continue;
    }

    pushSentence(sentences, text, start, end);
    start = skipWhitespace(text, end);
    i = start - 1;
  }

  if (start < text.length) {
    pushSentence(sentences, text, start, text.length);
  }

  return sentences;
}

function pushSentence(sentences: Sentence[], text: string, start: number, end: number): void {
  const slice = text.slice(start, end);
  if (slice.trim() === '') {
    return;
  }
  sentences.push({ text: slice.trim(), start, end });
}

function skipWhitespace(text: string, from: number): number {
  let index = from;
  while (index < text.length && /\s/.test(text[index] ?? '')) {
    index++;
  }
  return index;
}

function endsWithAbbreviation(before: string): boolean {
  const match = /([A-Za-z.]+)$/.exec(before);
  const word = match?.[1]?.toLowerCase();
  if (!word) {
    return false;
  }
  // A lone capital is an initial rather than a sentence end.
  if (word.length === 1) {
    return true;
  }
  return ABBREVIATIONS.has(word) || ABBREVIATIONS.has(word.replace(/\.$/, ''));
}

/**
 * Index of the sentence covering a fraction of the narration.
 *
 * The tour has no word timings, so elapsed time is mapped onto characters and
 * spoken pace is assumed even. It drifts within a sentence but lands on the
 * right one, which is all the highlight needs.
 */
export function sentenceAtFraction(sentences: readonly Sentence[], fraction: number): number {
  if (sentences.length === 0) {
    return -1;
  }

  const total = sentences[sentences.length - 1]?.end ?? 0;
  const position = Math.max(0, Math.min(1, fraction)) * total;

  for (let index = 0; index < sentences.length; index++) {
    if (position < (sentences[index]?.end ?? 0)) {
      return index;
    }
  }

  return sentences.length - 1;
}

/** Fraction of the narration at which a sentence begins, for seeking. */
export function fractionForSentence(sentences: readonly Sentence[], index: number): number {
  const total = sentences[sentences.length - 1]?.end ?? 0;
  const sentence = sentences[index];
  if (!sentence || total === 0) {
    return 0;
  }
  return sentence.start / total;
}
