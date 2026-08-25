import { BackendError, type BackendId, type TourBackend } from './types.js';

export type BackendPreference = BackendId | 'auto';

/**
 * Order used when the preference is `auto`.
 *
 * A CLI the user already installed and signed into is tried first: it needs no
 * key, and its cost sits with a subscription the user already pays for. The
 * API path is the fallback, and the reason no single auth route is load
 * bearing.
 */
export const AUTO_ORDER: BackendId[] = ['claude-cli', 'codex-cli', 'anthropic-api', 'openai-api'];

export async function resolveBackend(
  backends: readonly TourBackend[],
  preference: BackendPreference,
): Promise<TourBackend> {
  if (preference !== 'auto') {
    return resolveExplicit(backends, preference);
  }

  const ordered = [...backends].sort(
    (a, b) => indexOf(a.id) - indexOf(b.id),
  );

  for (const backend of ordered) {
    if (await backend.isAvailable()) {
      return backend;
    }
  }

  throw new BackendError(
    'No Talkthrough backend is ready. Install and sign in to a supported ' +
      'agent CLI, or run "Talkthrough: Set API key" to use an API key instead.',
    'unavailable',
  );
}

async function resolveExplicit(
  backends: readonly TourBackend[],
  preference: BackendId,
): Promise<TourBackend> {
  const backend = backends.find((candidate) => candidate.id === preference);

  if (!backend) {
    throw new BackendError(
      `The backend "${preference}" is not available in this version of Talkthrough. ` +
        'Change the talkthrough.backend setting.',
      'unavailable',
    );
  }

  if (!(await backend.isAvailable())) {
    throw new BackendError(
      `${backend.label} is selected in the talkthrough.backend setting but is not ready ` +
        'to run. Set it up, or switch the setting to "auto" to use whatever is available.',
      'unavailable',
    );
  }

  return backend;
}

function indexOf(id: BackendId): number {
  const index = AUTO_ORDER.indexOf(id);
  return index === -1 ? AUTO_ORDER.length : index;
}
