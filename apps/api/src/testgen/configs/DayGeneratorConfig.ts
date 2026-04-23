import { StartTimeConfig } from './StartTimeConfig';
import { ShiftLengthConfig } from './ShiftLengthConfig';
import { QuotaConfig } from './QuotaConfig';
import { CoverageWindowConfig } from './CoverageWindowConfig';
import { WindowCoverageConfig } from './WindowCoverageConfig';

export class DayGeneratorConfig {
  constructor(
    public readonly crewCountMin: number,
    public readonly crewCountMax: number,
    public readonly startTimes: StartTimeConfig,
    public readonly shiftLengths: ShiftLengthConfig,
    public readonly quotas: QuotaConfig[],
    public readonly coverage: CoverageWindowConfig[],
    public readonly windowCoverage: WindowCoverageConfig[] = [],
  ) {}
}
