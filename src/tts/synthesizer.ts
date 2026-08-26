import * as vscode from 'vscode';
import type { TourSegment } from '../tour/schema.js';
import { AudioCache } from './audioCache.js';
import type { CacheKeyInput } from './cacheKey.js';
import { TtsError, type TtsEngine } from './types.js';

export interface SynthesisProgress {
  ready: number;
  total: number;
}

/**
 * Turns a tour's narration into audio files, first segment first.
 *
 * The user should hear segment one while the rest is still being made, so
 * synthesis is on demand with a background pass filling in behind it. Requests
 * are de-duplicated, because the player asking for a segment that the
 * background pass is already working on is the normal case, not an edge one.
 */
export class TourSynthesizer implements vscode.Disposable {
  private readonly cache: AudioCache;
  private readonly inFlight = new Map<string, Promise<vscode.Uri>>();
  private cancellation = new vscode.CancellationTokenSource();

  private readonly progressed = new vscode.EventEmitter<SynthesisProgress>();
  public readonly onDidProgress = this.progressed.event;

  private segments: readonly TourSegment[] = [];
  private ready = 0;

  constructor(
    globalStorageUri: vscode.Uri,
    private engine: TtsEngine,
    private voice: string,
  ) {
    this.cache = new AudioCache(globalStorageUri);
  }

  public get audioRoot(): vscode.Uri {
    return this.cache.root;
  }

  /** Abandons any previous tour's synthesis and takes on a new one. */
  public begin(segments: readonly TourSegment[], engine: TtsEngine, voice: string): void {
    this.cancelPending();
    this.segments = segments;
    this.engine = engine;
    this.voice = voice;
    this.ready = 0;
    this.progressed.fire({ ready: 0, total: segments.length });
  }

  /** Resolves once this segment's audio exists on disk. */
  public async audioFor(index: number): Promise<vscode.Uri> {
    const segment = this.segments[index];
    if (!segment) {
      throw new TtsError(`There is no segment ${index} to narrate.`, 'synthesis-failed');
    }

    const input = this.keyFor(segment);
    const key = input.text + input.voice + input.engineId;

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const work = this.synthesize(input).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  /**
   * Fills the cache behind the listener, one segment at a time.
   *
   * Deliberately sequential: the point is to stay ahead of playback, and firing
   * every segment at a rate-limited API at once is a good way to be behind it.
   */
  public async prefetchFrom(startIndex: number): Promise<void> {
    const token = this.cancellation.token;

    for (let index = startIndex; index < this.segments.length; index++) {
      if (token.isCancellationRequested) {
        return;
      }
      try {
        await this.audioFor(index);
      } catch {
        // A segment that will not synthesize is reported when the player
        // reaches it; failing the whole background pass would be worse.
        return;
      }
    }
  }

  public dispose(): void {
    this.cancelPending();
    this.progressed.dispose();
  }

  private async synthesize(input: CacheKeyInput): Promise<vscode.Uri> {
    if (await this.cache.has(input)) {
      this.countReady();
      return this.cache.uriFor(input);
    }

    const bytes = await this.engine.synthesize({
      text: input.text,
      voice: input.voice,
      token: this.cancellation.token,
    });

    const uri = await this.cache.write(input, bytes);
    this.countReady();
    return uri;
  }

  private countReady(): void {
    this.ready = Math.min(this.ready + 1, this.segments.length);
    this.progressed.fire({ ready: this.ready, total: this.segments.length });
  }

  private keyFor(segment: TourSegment): CacheKeyInput {
    return {
      text: segment.narration,
      voice: this.voice,
      engineId: this.engine.id,
      format: this.engine.format,
    };
  }

  private cancelPending(): void {
    this.cancellation.cancel();
    this.cancellation.dispose();
    this.cancellation = new vscode.CancellationTokenSource();
    this.inFlight.clear();
  }
}
