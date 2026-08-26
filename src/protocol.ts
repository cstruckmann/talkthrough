/**
 * The host↔webview contract.
 *
 * The host owns the tour: position, editor choreography and synthesis. The
 * webview owns exactly one thing, playback, and reports what the audio element
 * did. Keeping the split that sharp is what stops the two from disagreeing
 * about which segment is current.
 *
 * This module is imported by both sides and must stay free of any vscode or
 * DOM dependency.
 */

export type SegmentKind = 'overview' | 'change' | 'reasoning' | 'caveat';

export interface LoadSegmentMessage {
  type: 'loadSegment';
  index: number;
  total: number;
  title: string;
  file: string;
  kind: SegmentKind;
  narration: string;
  /** Webview-safe audio URI, absent while that segment is still synthesizing. */
  audioSrc?: string;
  /**
   * Whether to start playing on arrival. Never true for the first segment of a
   * tour: browser autoplay policy requires the first playback to follow a user
   * gesture, so the panel waits for the play button.
   */
  autoplay: boolean;
  /** True when the tour has run past its last segment. */
  done: boolean;
}

export type HostToWebview =
  | LoadSegmentMessage
  | { type: 'tourStopped' }
  | { type: 'synthesisProgress'; ready: number; total: number }
  | { type: 'error'; message: string };

export type WebviewToHost =
  /** Sent once the panel's script is listening, so state can be replayed into it. */
  | { type: 'ready' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'stop' }
  /** The audio element reached the end of this segment by itself. */
  | { type: 'ended'; index: number }
  | { type: 'rate'; rate: number };

/** Playback speeds offered in the panel. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
