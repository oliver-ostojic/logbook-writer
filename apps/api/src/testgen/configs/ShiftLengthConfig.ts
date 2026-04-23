import { SeededRng } from '../rng';
import { distribute } from '../distribution';

export type ShiftLengthEntry = { lengthMin: number; percentage: number };

export class ShiftLengthConfig {
  constructor(public readonly entries: ShiftLengthEntry[]) {}

  distribute(count: number, rng: SeededRng): number[] {
    return distribute(
      this.entries.map(e => ({ value: e.lengthMin, percentage: e.percentage })),
      count,
      rng,
    );
  }
}
