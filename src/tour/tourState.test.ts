import { describe, expect, it } from 'vitest';
import type { TourScript } from './schema.js';
import { currentSegment, initialTourState, isActive, tourReducer } from './tourState.js';

const tour = (segmentCount: number): TourScript => ({
  version: 1,
  title: 'A tour',
  summary: 'A summary.',
  segments: Array.from({ length: segmentCount }, (_, i) => ({
    id: `seg-${i + 1}`,
    file: `src/file-${i + 1}.ts`,
    startLine: 1,
    endLine: 5,
    narration: `Segment ${i + 1}.`,
    kind: 'change' as const,
  })),
});

const start = (segmentCount = 3) =>
  tourReducer(initialTourState, { type: 'start', tour: tour(segmentCount) });

describe('tourReducer', () => {
  describe('start', () => {
    it('begins playing at the first segment', () => {
      const state = start();

      expect(state.status).toBe('playing');
      expect(state.index).toBe(0);
      expect(currentSegment(state)?.id).toBe('seg-1');
    });

    it('restarts from the beginning when a tour is already running', () => {
      const running = tourReducer(start(), { type: 'next' });

      const restarted = tourReducer(running, { type: 'start', tour: tour(2) });

      expect(restarted.index).toBe(0);
      expect(restarted.status).toBe('playing');
    });
  });

  describe('next', () => {
    it('advances one segment', () => {
      expect(tourReducer(start(), { type: 'next' }).index).toBe(1);
    });

    it('finishes on the last segment rather than running off the end', () => {
      let state = start(2);
      state = tourReducer(state, { type: 'next' });
      state = tourReducer(state, { type: 'next' });

      expect(state.status).toBe('done');
      expect(state.index).toBe(1);
    });

    it('stays done once finished', () => {
      let state = start(1);
      state = tourReducer(state, { type: 'next' });
      state = tourReducer(state, { type: 'next' });

      expect(state).toMatchObject({ status: 'done', index: 0 });
    });

    it('ignores next when no tour is loaded', () => {
      expect(tourReducer(initialTourState, { type: 'next' })).toBe(initialTourState);
    });
  });

  describe('previous', () => {
    it('steps back one segment', () => {
      const state = tourReducer(tourReducer(start(), { type: 'next' }), { type: 'previous' });

      expect(state.index).toBe(0);
    });

    it('stops at the first segment', () => {
      const state = tourReducer(start(), { type: 'previous' });

      expect(state.index).toBe(0);
      expect(state.status).toBe('playing');
    });

    it('re-enters a finished tour so a missed ending is recoverable', () => {
      let state = start(2);
      state = tourReducer(state, { type: 'next' });
      state = tourReducer(state, { type: 'next' });
      expect(state.status).toBe('done');

      state = tourReducer(state, { type: 'previous' });

      expect(state.status).toBe('playing');
      expect(state.index).toBe(0);
    });
  });

  describe('goto', () => {
    it('jumps to a segment', () => {
      expect(tourReducer(start(5), { type: 'goto', index: 3 }).index).toBe(3);
    });

    it('clamps an out-of-range index instead of breaking the tour', () => {
      expect(tourReducer(start(3), { type: 'goto', index: 99 }).index).toBe(2);
      expect(tourReducer(start(3), { type: 'goto', index: -4 }).index).toBe(0);
    });

    it('ignores a non-integer index', () => {
      const state = start(3);

      expect(tourReducer(state, { type: 'goto', index: 1.5 })).toBe(state);
    });

    it('resumes playing when jumping out of a finished tour', () => {
      let state = start(2);
      state = tourReducer(state, { type: 'next' });
      state = tourReducer(state, { type: 'next' });

      expect(tourReducer(state, { type: 'goto', index: 0 }).status).toBe('playing');
    });
  });

  describe('pause and resume', () => {
    it('pauses a playing tour and resumes it', () => {
      const paused = tourReducer(start(), { type: 'pause' });
      expect(paused.status).toBe('paused');

      expect(tourReducer(paused, { type: 'resume' }).status).toBe('playing');
    });

    it('keeps its place across a pause', () => {
      const advanced = tourReducer(start(3), { type: 'next' });
      const paused = tourReducer(advanced, { type: 'pause' });

      expect(paused.index).toBe(1);
    });

    it('still steps while paused, since stepping is an explicit user action', () => {
      const paused = tourReducer(start(3), { type: 'pause' });

      expect(tourReducer(paused, { type: 'next' }).index).toBe(1);
    });

    it('ignores resume when not paused, and pause when not playing', () => {
      const playing = start();
      expect(tourReducer(playing, { type: 'resume' })).toBe(playing);
      expect(tourReducer(initialTourState, { type: 'pause' })).toBe(initialTourState);
    });
  });

  describe('stop', () => {
    it('clears the tour entirely', () => {
      const state = tourReducer(start(), { type: 'stop' });

      expect(state).toEqual(initialTourState);
      expect(isActive(state)).toBe(false);
      expect(currentSegment(state)).toBeUndefined();
    });
  });

  it('ignores a tour with no segments', () => {
    const empty = { ...tour(0) };

    expect(tourReducer(initialTourState, { type: 'start', tour: empty })).toBe(initialTourState);
  });
});
