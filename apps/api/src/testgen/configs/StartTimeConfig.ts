import { SeededRng } from '../rng';
import { distribute } from '../distribution';

export type StartTimeEntry = { timeMin: number; percentageMin: number; percentageMax: number };

export class StartTimeConfig {
  constructor(public readonly entries: StartTimeEntry[]) {}

  distribute(count: number, rng: SeededRng): number[] {
    const entries = this.entries.map(e => {
      const lo = Math.min(e.percentageMin, e.percentageMax);
      const hi = Math.max(e.percentageMin, e.percentageMax);
      return { value: e.timeMin, percentage: lo + (hi - lo) * rng.next() };
    });
    return distribute(entries, count, rng);
  }
}
