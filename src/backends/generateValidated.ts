import { extractJson } from '../tour/extractJson.js';
import { validateTourScript, type TourScript } from '../tour/schema.js';
import { BackendError } from './types.js';

/**
 * Asks the backend for a tour and validates it, allowing exactly one retry in
 * which the validation errors are handed back to the model.
 *
 * `send` receives a correction note on the retry and undefined on the first
 * attempt, so each backend decides how to fold that into its own invocation.
 */
export async function generateValidatedTour(
  send: (correction: string | undefined) => Promise<string>,
): Promise<TourScript> {
  let correction: string | undefined;
  let lastRaw = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await send(correction);
    lastRaw = raw;

    const json = extractJson(raw);
    if (json === undefined) {
      correction = buildCorrection(['The response contained no JSON object at all.']);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      correction = buildCorrection([
        `The JSON could not be parsed: ${(error as Error).message}`,
      ]);
      continue;
    }

    const result = validateTourScript(parsed);
    if (result.ok) {
      return result.tour;
    }
    correction = buildCorrection(result.errors);
  }

  throw new BackendError(
    'The backend did not return a valid tour script, even after one retry.',
    'invalid-output',
    lastRaw,
  );
}

function buildCorrection(errors: string[]): string {
  return [
    'Your previous response was rejected for these reasons:',
    ...errors.map((error) => `- ${error}`),
    '',
    'Return the corrected tour script now, as a single raw JSON object with no',
    'surrounding prose and no code fence.',
  ].join('\n');
}
