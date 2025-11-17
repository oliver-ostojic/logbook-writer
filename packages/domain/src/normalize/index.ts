import { Crew } from '@logbook-writer/shared-types';
import type { ValidationResult } from '../validate';

export type NormalizedInput = {
  // Looser input accepted from API
  crews?: Array<Partial<Crew> & { id?: string | number } & Record<string, unknown>>;
  // Dates can be a single value or array; each may be string | number | Date
  dates?: unknown;
};

export type Normalized = {
  crews: Crew[];
  dates: string[];
};

export type NormalizeResult = ValidationResult & {
  data?: Normalized;
};

export const normalize = (input: NormalizedInput | unknown): NormalizeResult => {
  const inObj = (input && typeof input === 'object' ? (input as NormalizedInput) : {}) as NormalizedInput;

  const crewsRaw = Array.isArray(inObj.crews) ? inObj.crews : [];
  const errors: string[] = [];

  // Build crews with coercions and de-duplication (by id), keep first occurrence
  const seenCrewIds = new Set<string>();
  const crews: Crew[] = [];
  for (const [i, c] of crewsRaw.entries()) {
    const idRaw = (c as any)?.id ?? (c as any)?.crewId;
    const id = typeof idRaw === 'number' ? String(idRaw) : typeof idRaw === 'string' ? idRaw.trim() : '';
    if (!id) {
      errors.push(`Crew at index ${i} is missing id`);
      continue;
    }
    if (seenCrewIds.has(id)) {
      // skip duplicates, keep first
      continue;
    }
    seenCrewIds.add(id);
    const nameRaw = (c as any)?.name;
    const name = typeof nameRaw === 'string' && nameRaw.trim().length > 0 ? nameRaw.trim() : 'Unknown';
    crews.push({ id, name });
  }

  // Dates: accept single value or array; coerce to ISO strings; de-dupe and keep input order
  const datesInput = Array.isArray((inObj as any).dates)
    ? ((inObj as any).dates as unknown[])
    : (inObj as any).dates != null
    ? [((inObj as any).dates as unknown)]
    : [];

  const dates: string[] = [];
  const seenDates = new Set<string>();
  for (const [i, d] of datesInput.entries()) {
    const iso = coerceToISO(d);
    if (!iso) {
      errors.push(`Invalid date at index ${i}`);
      continue;
    }
    if (!seenDates.has(iso)) {
      seenDates.add(iso);
      dates.push(iso);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { crews, dates } };
};

const coerceToISO = (value: unknown): string | null => {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : value.toISOString();
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    const t = d.getTime();
    return Number.isNaN(t) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const d = new Date(s);
    const t = d.getTime();
    return Number.isNaN(t) ? null : d.toISOString();
  }
  return null;
};
