import type * as vscode from 'vscode';
import type { Changeset } from '../changeset/types.js';
import type { TourScript } from '../tour/schema.js';

export type BackendId = 'claude-cli' | 'codex-cli' | 'anthropic-api' | 'openai-api';

export interface GenerateTourRequest {
  changeset: Changeset;
  /** Optional agent session transcript, used to narrate reasoning. */
  transcript?: string;
  token?: vscode.CancellationToken;
  /** Reports progress to the UI; called with short human-readable steps. */
  onProgress?: (message: string) => void;
}

export interface TourBackend {
  readonly id: BackendId;
  /** Human-readable name, shown in pickers and error messages. */
  readonly label: string;
  /** Whether this backend can run right now: CLI on PATH, or key present. */
  isAvailable(): Promise<boolean>;
  generateTour(request: GenerateTourRequest): Promise<TourScript>;
}

export type BackendErrorKind =
  /** The backend cannot run at all: CLI missing, or no API key stored. */
  | 'unavailable'
  /** The backend ran but failed: non-zero exit, HTTP error, timeout. */
  | 'invocation-failed'
  /** The backend produced output that is not a valid TourScript. */
  | 'invalid-output'
  | 'cancelled';

export class BackendError extends Error {
  constructor(
    message: string,
    public readonly kind: BackendErrorKind,
    /** Raw backend output, surfaced in the output channel for debugging. */
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}
