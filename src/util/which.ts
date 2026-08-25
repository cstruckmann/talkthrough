import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

/**
 * Locates an executable on PATH.
 *
 * Talkthrough only ever invokes tools the user installed themselves, so this
 * is deliberately a lookup and never an install.
 */
export async function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  const pathValue = env['PATH'] ?? env['Path'] ?? '';
  if (pathValue === '') {
    return undefined;
  }

  const extensions =
    platform === 'win32'
      ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];

  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, command + extension);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here, or not executable; keep looking.
      }
    }
  }

  return undefined;
}
