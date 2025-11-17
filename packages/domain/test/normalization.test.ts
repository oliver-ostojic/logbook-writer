import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalize';

describe('domain normalization', () => {
  it('coerces various date inputs to ISO strings and de-dupes', () => {
    const now = new Date('2025-11-17T05:00:00.000Z');
    const ts = now.getTime();

    const res = normalize({
      crews: [{ id: 'A', name: ' Alice ' }],
      dates: [now, ts, '2025-11-17', '2025-11-17T05:00:00.000Z'],
    });

    expect(res.valid).toBe(true);
    const data = res.data!;
    expect(data.crews[0].name).toBe('Alice');
    // First two (Date and ts) normalize to the same ISO value; ensure no duplicates overall
    const unique = new Set(data.dates);
    expect(unique.size).toBe(data.dates.length);
    data.dates.forEach(d => {
      expect(typeof d).toBe('string');
      expect(Number.isNaN(new Date(d).getTime())).toBe(false);
    });
  });

  it('dedupes crews by id and defaults missing names', () => {
    const res = normalize({
      crews: [
        { id: 'A', name: 'Alpha' },
        { id: 'A', name: 'Should be ignored' },
        { id: 'B' },
      ],
      dates: [],
    });

    expect(res.valid).toBe(true);
    const data = res.data!;
    expect(data.crews).toHaveLength(2);
    expect(data.crews[0]).toEqual({ id: 'A', name: 'Alpha' });
    expect(data.crews[1]).toEqual({ id: 'B', name: 'Unknown' });
  });

  it('errors when any crew is missing id', () => {
    const res = normalize({
      crews: [
        { id: 'A', name: 'Alpha' },
        { name: 'No Id' } as any,
      ],
      dates: [],
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('missing id'))).toBe(true);
  });

  it('errors on invalid date value', () => {
    const res = normalize({
      crews: [{ id: 'A' }],
      dates: ['not-a-date', new Date('invalid')],
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('Invalid date'))).toBe(true);
  });

  it('handles empty or missing input by returning empty arrays', () => {
    const res1 = normalize({});
    expect(res1.valid).toBe(true);
    expect(res1.data).toEqual({ crews: [], dates: [] });

    const res2 = normalize(undefined as any);
    expect(res2.valid).toBe(true);
    expect(res2.data).toEqual({ crews: [], dates: [] });
  });
});
