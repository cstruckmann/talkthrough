import type * as vscode from 'vscode';

export type TtsEngineId = 'system' | 'openai';

/** Container the engine produces; drives both the file extension and playback. */
export type AudioFormat = 'wav' | 'mp3';

export interface SynthesisRequest {
  text: string;
  /** Engine-specific voice name. Empty means the engine's own default. */
  voice: string;
  token?: vscode.CancellationToken;
}

export interface TtsEngine {
  readonly id: TtsEngineId;
  readonly label: string;
  readonly format: AudioFormat;
  /** Whether this engine can run: platform support, or a stored key. */
  isAvailable(): Promise<boolean>;
  /** Returns the encoded audio; callers own writing it anywhere. */
  synthesize(request: SynthesisRequest): Promise<Uint8Array>;
}

export type TtsErrorKind = 'unavailable' | 'synthesis-failed' | 'cancelled';

export class TtsError extends Error {
  constructor(
    message: string,
    public readonly kind: TtsErrorKind,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'TtsError';
  }
}
