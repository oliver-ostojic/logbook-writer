import { SeededRng } from '../rng';
import { distribute } from '../distribution';

export type QuotaLengthEntry = {
  lengthMin: number;
  percentageMin: number;
  percentageMax: number;
};

export class QuotaConfig {
  constructor(
    public readonly roleId: number,
    public readonly coverageRateMin: number,
    public readonly coverageRateMax: number,
    public readonly lengths: QuotaLengthEntry[],
  ) {}

  pickEligibleCrew(crewIds: string[], rng: SeededRng): string[] {
    const lo = Math.min(this.coverageRateMin, this.coverageRateMax);
    const hi = Math.max(this.coverageRateMin, this.coverageRateMax);
    const rate = lo + (hi - lo) * rng.next();
    const shuffled = rng.shuffle(crewIds);
    return shuffled.slice(0, Math.round(shuffled.length * rate));
  }

  sampleLength(count: number, rng: SeededRng): number[] {
    const entries = this.lengths.map(e => {
      const lo = Math.min(e.percentageMin, e.percentageMax);
      const hi = Math.max(e.percentageMin, e.percentageMax);
      return { value: e.lengthMin, percentage: lo + (hi - lo) * rng.next() };
    });
    return distribute(entries, count, rng);
  }
}
