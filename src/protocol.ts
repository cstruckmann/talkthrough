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

/** One sentence of narration, with offsets used to map elapsed time onto text. */
export interface TranscriptSentence {
  text: string;
  start: number;
  end: number;
}

/** A button offered on an in-panel error. Commands are allowlisted host-side. */
export interface PlayerErrorAction {
  label: string;
  command: string;
}

export interface LoadSegmentMessage {
  type: 'loadSegment';
  index: number;
  total: number;
  title: string;
  file: string;
  kind: SegmentKind;
  narration: string;
  /** Narration split for the transcript; empty when there is nothing to show. */
  sentences: TranscriptSentence[];
  /** Webview-safe audio URI, absent while that segment is still synthesizing. */
  audioSrc?: string;
  /**
   * Whether to start playing on arrival. Never true for the first segment of a
   * tour: browser autoplay policy requires the first playback to follow a user
   * gesture, so the panel waits for the play button.
   */
  autoplay: boolean;
}

export type HostToWebview =
  | LoadSegmentMessage
  /** The tour reached its end. Playback stops; the loaded segment stays put. */
  | { type: 'tourFinished' }
  | { type: 'tourStopped' }
  | { type: 'synthesisProgress'; ready: number; total: number }
  /** A transient note shown under the transcript. */
  | { type: 'error'; message: string }
  /** Replaces the panel with an explained failure and a way out of it. */
  | { type: 'showError'; title: string; detail: string; actions: PlayerErrorAction[] };

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
  | { type: 'rate'; rate: number }
  /** Seek within the current segment, as a fraction of its narration. */
  | { type: 'seek'; fraction: number }
  /** Runs one of the commands offered by a shown error. */
  | { type: 'runCommand'; command: string };

/** Playback speeds offered in the panel. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
