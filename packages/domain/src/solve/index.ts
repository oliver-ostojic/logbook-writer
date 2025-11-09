import { Crew, Schedule } from '@logbook-writer/shared-types';
import { genId } from './utils';

export type SolveInput = {
  crews: Crew[];
  dates: string[];
};

// Simple round-robin solver: assign crews to dates in order
export const solve = (input: SolveInput): Schedule[] => {
  const { crews, dates } = input;
  const schedules: Schedule[] = [];
  if (!crews.length || !dates.length) return schedules;

  for (let i = 0; i < dates.length; i++) {
    const crew = crews[i % crews.length];
    schedules.push({
      id: genId('sch-'),
      date: dates[i],
      crewId: crew.id,
    });
  }

  return schedules;
};

