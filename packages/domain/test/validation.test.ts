import { describe, it, expect } from 'vitest';
import { validate } from '../src/validate';
import type { Crew, Schedule } from '@logbook-writer/shared-types';

describe('domain validation', () => {
  const crews: Crew[] = [
    { id: 'A', name: 'Alpha' },
    { id: 'B', name: 'Beta' },
  ];

  it('passes on valid schedules referencing known crews with proper dates', () => {
    const schedules: Schedule[] = [
      { id: 'sch-1', date: '2025-11-17T00:00:00.000Z', crewId: 'A' },
      { id: 'sch-2', date: '2025-11-18', crewId: 'B' },
    ];
    const res = validate(crews, schedules);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('fails when schedule references unknown crewId', () => {
    const schedules: Schedule[] = [
      { id: 'sch-x', date: '2025-11-17', crewId: 'Z' },
    ];
    const res = validate(crews, schedules);
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('unknown crewId'))).toBe(true);
  });

  it('fails on duplicate schedules for the same crew on the same date', () => {
    const schedules: Schedule[] = [
      { id: 'sch-a', date: '2025-11-17', crewId: 'A' },
      { id: 'sch-b', date: '2025-11-17', crewId: 'A' },
    ];
    const res = validate(crews, schedules);
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('multiple schedules'))).toBe(true);
  });

  it('fails when fields are missing or empty', () => {
    const schedules: Schedule[] = [
      { id: '', date: '', crewId: '' } as any,
      { id: 'sch-m', date: '', crewId: 'A' } as any,
      { id: '', date: '2025-11-17', crewId: '' } as any,
    ];
    const res = validate(crews, schedules);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('fails on invalid date string', () => {
    const schedules: Schedule[] = [
      { id: 'sch-bad', date: 'not-a-date', crewId: 'A' },
    ];
    const res = validate(crews, schedules);
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('invalid date'))).toBe(true);
  });
});
