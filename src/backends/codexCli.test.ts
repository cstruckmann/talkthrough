import { describe, expect, it } from 'vitest';
import { cleanCliOutput } from './codexCli.js';

const ESC = '\u001b';
const BEL = '\u0007';

describe('cleanCliOutput', () => {
  it('leaves plain output untouched', () => {
    expect(cleanCliOutput('{"version":1}')).toBe('{"version":1}');
  });

  it('does not touch the brackets of a JSON array', () => {
    const json = '{"segments":[{"id":"seg-1"},{"id":"seg-2"}]}';

    expect(cleanCliOutput(json)).toBe(json);
  });

  it('preserves square brackets in prose', () => {
    expect(cleanCliOutput('the array [1, 2, 3] stays')).toBe('the array [1, 2, 3] stays');
  });

  it('strips colour codes', () => {
    expect(cleanCliOutput(`${ESC}[32mdone${ESC}[0m {"version":1}`)).toBe('done {"version":1}');
  });

  it('strips cursor movement sequences', () => {
    expect(cleanCliOutput(`${ESC}[2K${ESC}[1G{"a":1}`)).toBe('{"a":1}');
  });

  it('strips an OSC title sequence terminated by BEL', () => {
    expect(cleanCliOutput(`${ESC}]0;codex${BEL}{"a":1}`)).toBe('{"a":1}');
  });

  it('turns carriage-return progress lines into newlines', () => {
    expect(cleanCliOutput('working\rworking..\r{"a":1}')).toBe('working\nworking..\n{"a":1}');
  });

  it('trims surrounding whitespace', () => {
    expect(cleanCliOutput('\n\n  {"a":1}  \n')).toBe('{"a":1}');
  });

  it('leaves a tour recoverable after heavy decoration', () => {
    const noisy = `${ESC}[2K${ESC}[36mthinking…${ESC}[0m\r${ESC}[2K{"version":1,"segments":[]}`;

    expect(cleanCliOutput(noisy)).toContain('{"version":1,"segments":[]}');
  });
});
