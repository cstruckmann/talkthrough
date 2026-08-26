import { describe, expect, it } from 'vitest';
import { argsFor, cleanCliOutput } from './codexCli.js';

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

describe('argsFor', () => {
  it('reads the prompt from stdin, not from argv', () => {
    // The prompt carries a whole diff; argv would overflow.
    expect(argsFor('/tmp/last.txt').at(-1)).toBe('-');
  });

  it('writes the final message to the given file', () => {
    const args = argsFor('/tmp/last.txt');

    expect(args).toContain('-o');
    expect(args[args.indexOf('-o') + 1]).toBe('/tmp/last.txt');
  });

  it('disables colour, so escapes never reach the answer', () => {
    const args = argsFor('/tmp/last.txt');

    expect(args[args.indexOf('--color') + 1]).toBe('never');
  });

  it('runs read-only, since generating a tour must not edit the workspace', () => {
    const args = argsFor('/tmp/last.txt');

    expect(args[args.indexOf('-s') + 1]).toBe('read-only');
  });

  it('does not require the CLI to be standing in a git repository', () => {
    expect(argsFor('/tmp/last.txt')).toContain('--skip-git-repo-check');
  });
});
