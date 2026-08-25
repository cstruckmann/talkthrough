import { z } from 'zod';

export const SEGMENT_KINDS = ['overview', 'change', 'reasoning', 'caveat'] as const;

/**
 * A path is rejected when it is absolute or escapes the repository. The tour
 * drives the editor by opening these paths, so a backend must not be able to
 * point one at something outside the workspace.
 */
const relativeRepoPath = z
  .string()
  .min(1, 'file must not be empty')
  .refine((value) => !value.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(value), {
    message: 'file must be relative to the repository root, not absolute',
  })
  .refine((value) => !value.split(/[\\/]/).includes('..'), {
    message: 'file must not navigate outside the repository',
  });

export const segmentSchema = z
  .object({
    id: z.string().min(1, 'id must not be empty'),
    file: relativeRepoPath,
    startLine: z.number().int('startLine must be a whole number').min(1, 'startLine is 1-based'),
    endLine: z.number().int('endLine must be a whole number').min(1, 'endLine is 1-based'),
    narration: z.string().min(1, 'narration must not be empty'),
    kind: z.enum(SEGMENT_KINDS),
  })
  .refine((segment) => segment.endLine >= segment.startLine, {
    message: 'endLine must be greater than or equal to startLine',
    path: ['endLine'],
  });

export const tourScriptSchema = z
  .object({
    version: z.literal(1),
    title: z.string().min(1, 'title must not be empty'),
    summary: z.string().min(1, 'summary must not be empty'),
    segments: z.array(segmentSchema).min(1, 'a tour needs at least one segment'),
  })
  .refine(
    (tour) => new Set(tour.segments.map((segment) => segment.id)).size === tour.segments.length,
    { message: 'segment ids must be unique', path: ['segments'] },
  );

export type TourSegment = z.infer<typeof segmentSchema>;
export type TourScript = z.infer<typeof tourScriptSchema>;

export type ValidationResult =
  | { ok: true; tour: TourScript }
  | { ok: false; errors: string[]; message: string };

/**
 * Validates backend output. On failure the messages are phrased to be fed back
 * to the model verbatim for its one retry, so they name the offending path.
 */
export function validateTourScript(input: unknown): ValidationResult {
  const result = tourScriptSchema.safeParse(input);
  if (result.success) {
    return { ok: true, tour: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return { ok: false, errors, message: errors.join('\n') };
}
