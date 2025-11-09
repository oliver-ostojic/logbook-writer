import { Crew } from '@logbook-writer/shared-types';
import type { ValidationResult } from '../validate';

export type NormalizedInput = {
  crews?: Array<Partial<Crew> & { id?: string }>;
  dates?: string[];
};

export type Normalized = {
  crews: Crew[];
  dates: string[];
};

export type NormalizeResult = ValidationResult & {
  data?: Normalized;
};

export const normalize = (input: NormalizedInput | unknown): NormalizeResult => {
  const inObj = (input as NormalizedInput) || {};

  const crewsRaw = inObj.crews || [];
  const errors: string[] = [];

  // Require that crews already have IDs assigned externally.
  for (const [i, c] of crewsRaw.entries()) {
    if (!c.id) {
      errors.push(`Crew at index ${i} is missing id`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const crews: Crew[] = crewsRaw.map((c) => ({
    id: c.id as string,
    name: c.name || 'Unknown',
  }));

  const dates = (inObj.dates || []).map((d) => String(d));

  return { valid: true, errors: [], data: { crews, dates } };
};
