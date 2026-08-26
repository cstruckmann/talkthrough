import type { TourScript } from './schema.js';

export type TourStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface TourState {
  status: TourStatus;
  /** Index into the tour's segments; meaningless when idle. */
  index: number;
  tour: TourScript | undefined;
}

export type TourAction =
  | { type: 'start'; tour: TourScript }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'goto'; index: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' };

export const initialTourState: TourState = { status: 'idle', index: 0, tour: undefined };

/**
 * The host owns tour position; the player UI only reports events into here.
 * Keeping it a pure reducer means the ordering rules — what happens at the last
 * segment, what a stray next does when idle — are testable without VS Code.
 */
export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'start':
      return action.tour.segments.length === 0
        ? state
        : { status: 'playing', index: 0, tour: action.tour };

    case 'stop':
      return initialTourState;

    case 'next': {
      if (!isActive(state)) {
        return state;
      }
      const last = lastIndex(state);
      if (state.index < last) {
        return { ...state, status: 'playing', index: state.index + 1 };
      }
      // Identity, not a fresh equal object: callers treat an unchanged state as
      // "nothing to do", and a new object here would have them replay the last
      // segment, which ends, advances, and replays it again forever.
      return state.status === 'done' ? state : { ...state, status: 'done', index: last };
    }

    case 'previous':
      if (!isActive(state)) {
        return state;
      }
      // Stepping back out of a finished tour re-enters it rather than doing
      // nothing, which is what makes "I missed that last bit" recoverable.
      return { ...state, status: 'playing', index: Math.max(0, state.index - 1) };

    case 'goto': {
      if (!isActive(state) || !Number.isInteger(action.index)) {
        return state;
      }
      const index = Math.min(Math.max(0, action.index), lastIndex(state));
      return { ...state, status: 'playing', index };
    }

    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;

    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'playing' } : state;

    default:
      return state;
  }
}

/** True while a tour is loaded, whether or not it is advancing. */
export function isActive(state: TourState): state is TourState & { tour: TourScript } {
  return state.tour !== undefined && state.status !== 'idle';
}

export function currentSegment(state: TourState) {
  return isActive(state) ? state.tour.segments[state.index] : undefined;
}

function lastIndex(state: TourState & { tour: TourScript }): number {
  return state.tour.segments.length - 1;
}
