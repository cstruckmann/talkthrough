import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecCancelledError, ExecError, run } from '../util/exec.js';
import { TtsError, type SynthesisRequest, type TtsEngine } from './types.js';

/** Linear PCM at 22 kHz: a WAV every browser audio element will play. */
const DATA_FORMAT = 'LEI16@22050';

const TIMEOUT_MS = 120_000;

/**
 * The zero-config engine: macOS `say`, which needs no account, no key and no
 * network. This is the golden path for v1.
 *
 * Windows and Linux have no equivalent that is present by default, so this
 * engine reports itself unavailable there rather than failing at playback time.
 */
export class SystemTtsEngine implements TtsEngine {
  public readonly id = 'system' as const;
  public readonly label = 'System voice';
  public readonly format = 'wav' as const;

  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  public async isAvailable(): Promise<boolean> {
    return this.platform === 'darwin';
  }

  public async synthesize(request: SynthesisRequest): Promise<Uint8Array> {
    if (!(await this.isAvailable())) {
      throw new TtsError(
        'Talkthrough has no built-in voice on this platform yet. Store an OpenAI ' +
          'API key with "Talkthrough: Set API key" and set talkthrough.tts to "openai".',
        'unavailable',
      );
    }

    // `say` writes to a file rather than stdout, so it needs somewhere to put it.
    const directory = await mkdtemp(join(tmpdir(), 'talkthrough-tts-'));
    const outputPath = join(directory, 'segment.wav');

    try {
      const args = ['-o', outputPath, '--data-format', DATA_FORMAT];
      if (request.voice) {
        args.unshift('-v', request.voice);
      }

      // Narration goes over stdin: it can be several sentences, and it is not
      // worth discovering the command-line length limit at playback time.
      await run('say', args, {
        cwd: directory,
        timeoutMs: TIMEOUT_MS,
        stdin: request.text,
        ...(request.token ? { token: request.token } : {}),
      });

      return new Uint8Array(await readFile(outputPath));
    } catch (error) {
      if (error instanceof ExecCancelledError) {
        throw new TtsError('Narration was cancelled.', 'cancelled');
      }
      if (error instanceof ExecError && error.cause.code === 'ENOENT') {
        throw new TtsError('The say command was not found on this system.', 'unavailable');
      }
      throw new TtsError(
        `The system voice could not synthesize this segment: ${(error as Error).message}`,
        'synthesis-failed',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
