export class WindowCoverageConfig {
  constructor(
    public readonly roleId: number,
    public readonly startMin: number,
    public readonly endMin: number,
    public readonly crewCount: number,
    public readonly constraintRule: 'MIN' | 'MAX' | 'EXACTLY' = 'EXACTLY',
    public readonly usageProbability: number = 1.0,
  ) {}
}
