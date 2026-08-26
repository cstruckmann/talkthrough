import { describe, expect, it } from 'vitest';
import { encodeProjectPath, parseSessionLog, renderTranscript } from './sessionLog.js';

const line = (value: unknown) => JSON.stringify(value);

const assistant = (text: string, extra: Record<string, unknown> = {}) =>
  line({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    ...extra,
  });

const user = (text: string) =>
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });

describe('encodeProjectPath', () => {
  it('replaces separators with hyphens', () => {
    expect(encodeProjectPath('/Users/me/code/app')).toBe('-Users-me-code-app');
  });

  it('handles Windows separators', () => {
    expect(encodeProjectPath('C:\\Users\\me\\app')).toBe('C:-Users-me-app');
  });
});

describe('parseSessionLog', () => {
  it('reads assistant and user prose', () => {
    const log = [user('add retries'), assistant('I used a token bucket.')].join('\n');

    expect(parseSessionLog(log)).toEqual([
      { role: 'user', text: 'add retries' },
      { role: 'assistant', text: 'I used a token bucket.' },
    ]);
  });

  it('skips bookkeeping record types', () => {
    const log = [
      line({ type: 'file-history-snapshot' }),
      line({ type: 'queue-operation' }),
      line({ type: 'attachment' }),
      assistant('The real content.'),
    ].join('\n');

    expect(parseSessionLog(log)).toHaveLength(1);
  });

  it('skips sidechain turns, which belong to a subagent task', () => {
    const log = [
      assistant('Main line reasoning.'),
      assistant('Subagent chatter.', { isSidechain: true }),
    ].join('\n');

    expect(parseSessionLog(log).map((turn) => turn.text)).toEqual(['Main line reasoning.']);
  });

  it('keeps only text blocks, dropping tool calls', () => {
    const log = line({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Explaining.' },
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    });

    expect(parseSessionLog(log)).toEqual([{ role: 'assistant', text: 'Explaining.' }]);
  });

  it('accepts string content as well as blocks', () => {
    const log = line({ type: 'user', message: { role: 'user', content: 'plain string' } });

    expect(parseSessionLog(log)).toEqual([{ role: 'user', text: 'plain string' }]);
  });

  it('skips a half-written trailing line rather than throwing', () => {
    const log = `${assistant('Complete turn.')}\n{"type":"assistant","mess`;

    expect(parseSessionLog(log)).toHaveLength(1);
  });

  it('skips turns whose text is empty', () => {
    expect(parseSessionLog(assistant('   '))).toEqual([]);
  });

  it('returns nothing for an empty log', () => {
    expect(parseSessionLog('')).toEqual([]);
    expect(parseSessionLog('\n\n')).toEqual([]);
  });
});

describe('renderTranscript', () => {
  const turns = [
    { role: 'user' as const, text: 'add retries' },
    { role: 'assistant' as const, text: 'I used a token bucket.' },
  ];

  it('labels who is speaking', () => {
    const rendered = renderTranscript(turns, 10_000);

    expect(rendered).toContain('Developer: add retries');
    expect(rendered).toContain('Agent: I used a token bucket.');
  });

  it('keeps the tail when over budget, since recent work is the subject', () => {
    const long = [
      { role: 'assistant' as const, text: 'x'.repeat(5_000) },
      { role: 'assistant' as const, text: 'THE-RECENT-PART' },
    ];

    const rendered = renderTranscript(long, 200);

    expect(rendered).toContain('THE-RECENT-PART');
    expect(rendered.length).toBeLessThanOrEqual(200);
  });

  it('starts at a turn boundary rather than mid-sentence', () => {
    const long = [
      { role: 'assistant' as const, text: 'x'.repeat(500) },
      { role: 'user' as const, text: 'and then this' },
    ];

    expect(renderTranscript(long, 100).startsWith('Developer:')).toBe(true);
  });

  it('returns empty for no turns', () => {
    expect(renderTranscript([], 100)).toBe('');
  });
});
