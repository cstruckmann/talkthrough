import { describe, expect, it } from 'vitest';
import { fractionForSentence, sentenceAtFraction, splitSentences } from './sentences.js';

const texts = (input: string) => splitSentences(input).map((sentence) => sentence.text);

describe('splitSentences', () => {
  it('splits on sentence-ending punctuation', () => {
    expect(texts('First thing. Second thing! Third thing?')).toEqual([
      'First thing.',
      'Second thing!',
      'Third thing?',
    ]);
  });

  it('returns offsets that index back into the original text', () => {
    const input = 'One sentence. Another one.';
    const sentences = splitSentences(input);

    expect(input.slice(sentences[1]!.start, sentences[1]!.end)).toBe('Another one.');
  });

  it('keeps a single sentence whole', () => {
    expect(texts('Just the one sentence here')).toEqual(['Just the one sentence here']);
  });

  it('does not split on an abbreviation', () => {
    expect(texts('It caches responses, e.g. from the API. Then it returns them.')).toEqual([
      'It caches responses, e.g. from the API.',
      'Then it returns them.',
    ]);
  });

  it('does not split on a decimal or version number', () => {
    expect(texts('The delay starts at 1.5 seconds and doubles.')).toEqual([
      'The delay starts at 1.5 seconds and doubles.',
    ]);
  });

  it('keeps closing punctuation with its sentence', () => {
    expect(texts('He called it "done." Then he left.')).toEqual([
      'He called it "done."',
      'Then he left.',
    ]);
  });

  it('handles an ellipsis without producing empty sentences', () => {
    const sentences = splitSentences('It waits... then it retries.');

    expect(sentences.every((sentence) => sentence.text.trim() !== '')).toBe(true);
  });

  it('does not split on a single-letter initial', () => {
    expect(texts('Written by J. Smith last year.')).toEqual(['Written by J. Smith last year.']);
  });

  it('handles empty and whitespace-only input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n ')).toEqual([]);
  });

  it('handles text with no terminal punctuation at all', () => {
    expect(texts('no punctuation anywhere')).toEqual(['no punctuation anywhere']);
  });

  it('covers the whole narration across its sentences', () => {
    const input = 'One. Two. Three.';
    const sentences = splitSentences(input);

    expect(sentences[0]!.start).toBe(0);
    expect(sentences[sentences.length - 1]!.end).toBe(input.length);
  });
});

describe('sentenceAtFraction', () => {
  const sentences = splitSentences('AAAA. BBBB. CCCC.');

  it('lands on the first sentence at the start', () => {
    expect(sentenceAtFraction(sentences, 0)).toBe(0);
  });

  it('lands on the last sentence at the end', () => {
    expect(sentenceAtFraction(sentences, 1)).toBe(sentences.length - 1);
  });

  it('advances through the sentences as the fraction grows', () => {
    expect(sentenceAtFraction(sentences, 0.5)).toBe(1);
  });

  it('clamps a fraction outside zero to one', () => {
    expect(sentenceAtFraction(sentences, -3)).toBe(0);
    expect(sentenceAtFraction(sentences, 9)).toBe(sentences.length - 1);
  });

  it('returns -1 when there is nothing to highlight', () => {
    expect(sentenceAtFraction([], 0.5)).toBe(-1);
  });
});

describe('fractionForSentence', () => {
  const sentences = splitSentences('AAAA. BBBB. CCCC.');

  it('starts the first sentence at zero', () => {
    expect(fractionForSentence(sentences, 0)).toBe(0);
  });

  it('is monotonic across sentences', () => {
    expect(fractionForSentence(sentences, 1)).toBeGreaterThan(fractionForSentence(sentences, 0));
    expect(fractionForSentence(sentences, 2)).toBeGreaterThan(fractionForSentence(sentences, 1));
  });

  it('round-trips back to the same sentence', () => {
    for (let index = 0; index < sentences.length; index++) {
      const fraction = fractionForSentence(sentences, index);
      expect(sentenceAtFraction(sentences, fraction)).toBe(index);
    }
  });

  it('returns zero for an index that does not exist', () => {
    expect(fractionForSentence(sentences, 99)).toBe(0);
    expect(fractionForSentence([], 0)).toBe(0);
  });
});
