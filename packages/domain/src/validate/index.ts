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
    const sid = typeof s.id === 'string' ? s.id.trim() : '';
    if (!sid) errors.push(`Schedule missing id for date=${s.date ?? '(unknown)'}`);

    const crewId = typeof s.crewId === 'string' ? s.crewId.trim() : '';
    if (!crewId) errors.push(`Schedule ${sid || '(no-id)'} missing crewId`);
    else if (!crewIds.has(crewId)) errors.push(`Schedule ${sid || '(no-id)'} references unknown crewId=${crewId}`);

    const dateStr = typeof s.date === 'string' ? s.date.trim() : '';
    if (!dateStr) errors.push(`Schedule ${sid || '(no-id)'} missing date`);
    else if (Number.isNaN(new Date(dateStr).getTime())) errors.push(`Schedule ${sid || '(no-id)'} has invalid date=${dateStr}`);
  }

  // Duplicate check: ensure same crew doesn't have duplicate schedule on same date
  const seen = new Set<string>();
  for (const s of schedules) {
    const kCrew = typeof s.crewId === 'string' ? s.crewId.trim() : '';
    const kDate = typeof s.date === 'string' ? s.date.trim() : '';
    if (!kCrew || !kDate) continue;
    const key = `${kCrew}::${kDate}`;
    if (seen.has(key)) errors.push(`Crew ${kCrew} has multiple schedules on ${kDate}`);
    seen.add(key);
  }

  return { valid: errors.length === 0, errors };
};
