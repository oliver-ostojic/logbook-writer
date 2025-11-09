import { Crew, Schedule } from '@logbook-writer/shared-types';

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export const validate = (
  crews: Crew[],
  schedules: Schedule[]
): ValidationResult => {
  const errors: string[] = [];

  const crewIds = new Set(crews.map((c) => c.id));

  for (const s of schedules) {
    if (!s.id) errors.push(`Schedule missing id for date=${s.date}`);
    if (!s.date) errors.push(`Schedule ${s.id} missing date`);
    if (!s.crewId) errors.push(`Schedule ${s.id} missing crewId`);
    else if (!crewIds.has(s.crewId)) errors.push(`Schedule ${s.id} references unknown crewId=${s.crewId}`);
  }

  // Simple overlap check: ensure same crew doesn't have duplicate schedule on same date
  const seen = new Set<string>();
  for (const s of schedules) {
    const key = `${s.crewId}::${s.date}`;
    if (seen.has(key)) errors.push(`Crew ${s.crewId} has multiple schedules on ${s.date}`);
    seen.add(key);
  }

  return { valid: errors.length === 0, errors };
};
