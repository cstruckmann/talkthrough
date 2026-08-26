export interface InstalledVoice {
  name: string;
  locale: string;
  sample: string;
  /**
   * Enhanced and Premium voices are neural and sound markedly better than the
   * compact voices macOS ships by default, which are the usual cause of a
   * gritty, artefact-heavy tour.
   */
  quality: 'compact' | 'enhanced' | 'premium';
}

/**
 * Parses `say -v '?'` output.
 *
 * Lines look like:
 *   Samantha            en_US    # Hello! My name is Samantha.
 *   Zoe (Premium)       en_US    # Hello! My name is Zoe.
 *
 * Names contain spaces and parentheses, and the name column is padded to a
 * fixed width, so the parse anchors on the comment marker and treats the last
 * token before it as the locale.
 */
export function parseVoiceList(stdout: string): InstalledVoice[] {
  const localePattern = /^[A-Za-z]{2,3}(?:_[A-Za-z]{2,4})?(?:@\S+)?$/;
  const voices: InstalledVoice[] = [];

  for (const line of stdout.split('\n')) {
    // Anchor on the comment marker rather than on column runs: the name column
    // is padded to a fixed width, so a long name leaves only a single space
    // before the locale.
    const comment = line.indexOf('#');
    if (comment === -1) {
      continue;
    }

    const left = line.slice(0, comment).trimEnd();
    const boundary = left.lastIndexOf(' ');
    if (boundary === -1) {
      continue;
    }

    const locale = left.slice(boundary + 1).trim();
    const name = left.slice(0, boundary).trim();
    if (name === '' || !localePattern.test(locale)) {
      continue;
    }

    voices.push({
      name,
      locale,
      sample: line.slice(comment + 1).trim(),
      quality: qualityOf(name),
    });
  }

  return voices;
}

function qualityOf(name: string): InstalledVoice['quality'] {
  const lowered = name.toLowerCase();
  if (lowered.includes('(premium)')) {
    return 'premium';
  }
  if (lowered.includes('(enhanced)')) {
    return 'enhanced';
  }
  return 'compact';
}

/**
 * Orders voices for the picker: best quality first, and voices matching the
 * editor's language ahead of the rest, since that is what most users want.
 */
export function rankVoices(voices: InstalledVoice[], preferredLanguage: string): InstalledVoice[] {
  const qualityRank = { premium: 0, enhanced: 1, compact: 2 } as const;
  const language = preferredLanguage.split(/[-_]/)[0]?.toLowerCase() ?? 'en';

  return [...voices].sort((a, b) => {
    const aMatches = a.locale.toLowerCase().startsWith(language) ? 0 : 1;
    const bMatches = b.locale.toLowerCase().startsWith(language) ? 0 : 1;
    if (aMatches !== bMatches) {
      return aMatches - bMatches;
    }
    if (qualityRank[a.quality] !== qualityRank[b.quality]) {
      return qualityRank[a.quality] - qualityRank[b.quality];
    }
    return a.name.localeCompare(b.name);
  });
}
