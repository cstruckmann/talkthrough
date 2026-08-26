import { describe, expect, it } from 'vitest';
import { parseVoiceList, rankVoices } from './voiceList.js';

const sample = [
  'Albert              en_US    # Hello! My name is Albert.',
  'Bad News            en_US    # Hello! My name is Bad News.',
  'Daniel              en_GB    # Hello! My name is Daniel.',
  'Samantha (Enhanced) en_US    # Hello! My name is Samantha.',
  'Zoe (Premium)       en_US    # Hello! My name is Zoe.',
  'Amélie              fr_CA    # Bonjour! Je m’appelle Amélie.',
  'Eddy (Enhanced)     de_DE    # Hallo! Ich heiße Eddy.',
].join('\n');

describe('parseVoiceList', () => {
  it('reads name, locale and sample for each voice', () => {
    const voices = parseVoiceList(sample);

    expect(voices).toHaveLength(7);
    expect(voices[0]).toEqual({
      name: 'Albert',
      locale: 'en_US',
      sample: 'Hello! My name is Albert.',
      quality: 'compact',
    });
  });

  it('keeps names that contain spaces', () => {
    expect(parseVoiceList(sample).map((voice) => voice.name)).toContain('Bad News');
  });

  it('recognises enhanced and premium voices', () => {
    const byName = new Map(parseVoiceList(sample).map((voice) => [voice.name, voice.quality]));

    expect(byName.get('Samantha (Enhanced)')).toBe('enhanced');
    expect(byName.get('Zoe (Premium)')).toBe('premium');
    expect(byName.get('Daniel')).toBe('compact');
  });

  it('handles non-ascii names', () => {
    expect(parseVoiceList(sample).map((voice) => voice.name)).toContain('Amélie');
  });

  it('ignores blank and malformed lines', () => {
    expect(parseVoiceList('\n\nnot a voice line\n')).toEqual([]);
  });
});

describe('rankVoices', () => {
  it('puts the best quality first within the preferred language', () => {
    const ranked = rankVoices(parseVoiceList(sample), 'en');

    expect(ranked[0]?.name).toBe('Zoe (Premium)');
    expect(ranked[1]?.name).toBe('Samantha (Enhanced)');
  });

  it('ranks matching-language voices above others regardless of quality', () => {
    const ranked = rankVoices(parseVoiceList(sample), 'en');
    const germanEnhanced = ranked.findIndex((voice) => voice.name === 'Eddy (Enhanced)');
    const englishCompact = ranked.findIndex((voice) => voice.name === 'Albert');

    expect(englishCompact).toBeLessThan(germanEnhanced);
  });

  it('accepts a hyphenated editor language tag', () => {
    const ranked = rankVoices(parseVoiceList(sample), 'de-DE');

    expect(ranked[0]?.name).toBe('Eddy (Enhanced)');
  });

  it('does not mutate its input', () => {
    const voices = parseVoiceList(sample);
    const first = voices[0]?.name;

    rankVoices(voices, 'de');

    expect(voices[0]?.name).toBe(first);
  });
});
