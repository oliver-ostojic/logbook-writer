export class CoverageWindowConfig {
  constructor(
    public readonly roleId: number,
    public readonly startMin: number,
    public readonly endMin: number,
    public readonly pctPerHourMin: number,
    public readonly pctPerHourMax: number,
    public readonly constraintRule: 'MIN' | 'MAX' | 'EXACTLY' = 'MIN',
  ) {}

  samplePct(rand: number): number {
    const lo = Math.min(this.pctPerHourMin, this.pctPerHourMax);
    const hi = Math.max(this.pctPerHourMin, this.pctPerHourMax);
    return lo + (hi - lo) * rand;
  }
}
