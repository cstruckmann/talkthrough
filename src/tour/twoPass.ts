import type { Changeset, FileChange } from '../changeset/types.js';
import type { CompleteOptions, TourBackend } from '../backends/types.js';
import { renderChangeset } from '../prompt/assemble.js';

/**
 * Above this many changed files, the raw diff stops fitting comfortably and,
 * more importantly, stops being useful: a model given fifty diffs at once
 * narrates the ones it saw last. Summarizing first gives the tour pass an even
 * view of the whole changeset.
 */
export const TWO_PASS_FILE_THRESHOLD = 20;

/** Bounds on a single summarization request. */
const MAX_FILES_PER_BATCH = 8;
const MAX_CHARS_PER_BATCH = 60_000;

export function shouldUseTwoPass(changeset: Changeset): boolean {
  return changeset.files.length > TWO_PASS_FILE_THRESHOLD;
}

/**
 * Groups files into summarization batches.
 *
 * Both bounds matter: the file count keeps any one response from having to
 * cover too much, and the character bound stops a handful of enormous diffs
 * from blowing the request size regardless of how few files they are.
 */
export function batchFiles(
  files: readonly FileChange[],
  maxFiles: number = MAX_FILES_PER_BATCH,
  maxChars: number = MAX_CHARS_PER_BATCH,
): FileChange[][] {
  const batches: FileChange[][] = [];
  let current: FileChange[] = [];
  let currentChars = 0;

  for (const file of files) {
    const size = file.patch.length;

    // A file larger than the whole budget still has to go somewhere; give it a
    // batch of its own rather than dropping it.
    if (current.length > 0 && (current.length >= maxFiles || currentChars + size > maxChars)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(file);
    currentChars += size;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export interface SummarizeOptions extends CompleteOptions {
  /** Reports batch progress, since this pass can take a while on a big diff. */
  onProgress?: ((message: string) => void) | undefined;
}

/**
 * Replaces every file's diff with a summary of it, batch by batch.
 *
 * The returned changeset has the same shape as the original, so the tour prompt
 * and everything downstream stay unchanged; only the content of each patch is
 * different, and `summarized` says so.
 */
export async function summarizeChangeset(
  backend: TourBackend,
  template: string,
  changeset: Changeset,
  options: SummarizeOptions = {},
): Promise<Changeset> {
  const batches = batchFiles(changeset.files);
  const summaries = new Map<string, string>();

  for (const [index, batch] of batches.entries()) {
    options.onProgress?.(`Summarizing changes… batch ${index + 1} of ${batches.length}`);

    const batchChangeset: Changeset = { ...changeset, files: batch };
    const prompt = template.replace('{{CHANGESET}}', renderChangeset(batchChangeset));

    const response = await backend.complete(prompt, {
      ...(options.token ? { token: options.token } : {}),
    });

    for (const [path, summary] of parseSummaries(response)) {
      summaries.set(path, summary);
    }
  }

  return {
    ...changeset,
    files: changeset.files.map((file) => {
      const summary = summaries.get(file.path);
      return summary
        ? { ...file, patch: summary, summarized: true, truncated: false }
        : // A file the summarizer skipped keeps its diff; losing it silently
          // would be worse than a slightly larger prompt.
          file;
    }),
  };
}

/**
 * Splits the summarizer's output into per-file blocks.
 *
 * Keyed on the `## path` headings the prompt asks for. A block whose path was
 * not in the changeset is discarded rather than trusted, so a hallucinated
 * filename cannot reach the tour.
 */
export function parseSummaries(response: string): Map<string, string> {
  const summaries = new Map<string, string>();
  const lines = response.split('\n');

  let path: string | undefined;
  let body: string[] = [];

  const flush = () => {
    if (path !== undefined) {
      const text = body.join('\n').trim();
      if (text !== '') {
        summaries.set(path, text);
      }
    }
  };

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      path = heading[1];
      body = [];
      continue;
    }
    if (path !== undefined) {
      body.push(line);
    }
  }
  flush();

  return summaries;
}
