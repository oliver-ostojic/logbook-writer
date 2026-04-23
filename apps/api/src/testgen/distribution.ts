import { SeededRng } from './rng';

type DistEntry<T> = { value: T; percentage: number };

export function distribute<T>(entries: DistEntry<T>[], count: number, rng: SeededRng): T[] {
  if (entries.length === 0 || count === 0) return [];

  const total = entries.reduce((s, e) => s + e.percentage, 0);
  const normalized = entries.map(e => ({ ...e, percentage: e.percentage / total }));

  const floatCounts = normalized.map(e => ({ value: e.value, float: e.percentage * count }));
  const floors = floatCounts.map(e => ({ value: e.value, count: Math.floor(e.float), remainder: e.float - Math.floor(e.float) }));

  let allocated = floors.reduce((s, e) => s + e.count, 0);
  const remaining = count - allocated;

  const sorted = [...floors].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++) {
    sorted[i].count += 1;
  }

  const pool: T[] = [];
  for (const entry of sorted) {
    for (let i = 0; i < entry.count; i++) {
      pool.push(entry.value);
    }
  }

  return rng.shuffle(pool);
}
