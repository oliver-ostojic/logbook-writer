import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalize';
import { solve } from '../src/solve';
import { validate } from '../src/validate';

describe('domain solver (round-robin)', () => {
  it('assigns crews to dates round-robin and produces valid schedules', () => {
    const normalized = normalize({
      crews: [
        { id: 'crew-A', name: 'Alice' },
        { id: 'crew-B', name: 'Bob' },
      ],
      dates: ['2025-11-10', '2025-11-11', '2025-11-12'],
    });

    expect(normalized.valid).toBe(true);
    const input = normalized.data!;

    const schedules = solve({ crews: input.crews, dates: input.dates });

    // Expect 3 schedules
    expect(schedules).toHaveLength(3);

    // Validate schedules against crews
    const result = validate(input.crews, schedules);
    expect(result.valid).toBe(true);

    // Check round-robin assignment
    expect(schedules[0].crewId).toBe(input.crews[0].id);
    expect(schedules[1].crewId).toBe(input.crews[1].id);
    expect(schedules[2].crewId).toBe(input.crews[0].id);
  });
});
