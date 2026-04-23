import { DayGeneratorConfig } from './configs/DayGeneratorConfig';
import { makeRng } from './rng';
import { CrewRecord, CoverageWindowSpec, CrewQuotaSpec, DayPayload, ShiftSpec } from './types';

export function generateDayPayload(
  config: DayGeneratorConfig,
  allCrew: CrewRecord[],
  seed?: number,
): DayPayload {
  const rng = makeRng(seed);

  const crewCount = resolveRange(config.crewCountMin, config.crewCountMax, rng.next());
  if (allCrew.length < crewCount) {
    throw new Error(
      `Not enough crew: requested ${crewCount}, store has ${allCrew.length}`,
    );
  }

  const crew = rng.shuffle(allCrew).slice(0, crewCount);
  const shifts = buildShifts(config, crew, rng);
  const crewQuotas = buildQuotas(config, shifts, crew, rng);
  const coverageWindows = [
    ...buildCoverageWindows(config, shifts, rng),
    ...buildWindowCoverage(config, rng),
  ];

  return { shifts, coverageWindows, crewQuotas };
}

function resolveRange(min: number, max: number, rand: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rand * (hi - lo + 1));
}

function buildShifts(
  config: DayGeneratorConfig,
  crew: CrewRecord[],
  rng: ReturnType<typeof makeRng>,
): ShiftSpec[] {
  const startTimes = config.startTimes.distribute(crew.length, rng);
  const lengths = config.shiftLengths.distribute(crew.length, rng);

  return crew.map((c, i) => {
    const startMin = Math.max(0, Math.min(1439, startTimes[i]));
    return { crewId: c.id, startMin, endMin: startMin + lengths[i] };
  });
}

function buildQuotas(
  config: DayGeneratorConfig,
  shifts: ShiftSpec[],
  crew: CrewRecord[],
  rng: ReturnType<typeof makeRng>,
): CrewQuotaSpec[] {
  const shiftMap = new Map(shifts.map(s => [s.crewId, s]));
  const crewRoleMap = new Map(crew.map(c => [c.id, c.roleIds]));
  const quotas: CrewQuotaSpec[] = [];

  for (const quotaConfig of config.quotas) {
    const eligibleCrewIds = shifts
      .map(s => s.crewId)
      .filter(id => crewRoleMap.get(id)?.includes(quotaConfig.roleId) ?? false);
    const picked = quotaConfig.pickEligibleCrew(eligibleCrewIds, rng);
    const lengths = quotaConfig.sampleLength(picked.length, rng);

    picked.forEach((crewId, i) => {
      const shift = shiftMap.get(crewId)!;
      const requiredMin = Math.min(lengths[i], shift.endMin - shift.startMin);
      quotas.push({
        roleId: quotaConfig.roleId,
        crewId,
        startMin: shift.startMin,
        endMin: shift.endMin,
        requiredMin,
      });
    });
  }

  return quotas;
}

function buildCoverageWindows(
  config: DayGeneratorConfig,
  shifts: ShiftSpec[],
  rng: ReturnType<typeof makeRng>,
): CoverageWindowSpec[] {
  const windows: CoverageWindowSpec[] = [];

  for (const cw of config.coverage) {
    let hourStart = cw.startMin;
    while (hourStart < cw.endMin) {
      const hourEnd = Math.min(hourStart + 60, cw.endMin);
      const available = shifts.filter(
        s => s.startMin < hourEnd && s.endMin > hourStart,
      ).length;
      const pct = cw.samplePct(rng.next());
      const crewPerTaskLength = Math.max(0, Math.round(available * pct));

      windows.push({
        roleId: cw.roleId,
        startMin: hourStart,
        endMin: hourEnd,
        crewPerTaskLength,
        constraintRule: cw.constraintRule,
      });

      hourStart += 60;
    }
  }

  return windows;
}

function buildWindowCoverage(
  config: DayGeneratorConfig,
  rng: ReturnType<typeof makeRng>,
): CoverageWindowSpec[] {
  return config.windowCoverage
    .filter(wc => rng.next() < wc.usageProbability)
    .map(wc => ({
      roleId: wc.roleId,
      startMin: wc.startMin,
      endMin: wc.endMin,
      crewPerTaskLength: Math.max(0, Math.round(wc.crewCount)),
      constraintRule: wc.constraintRule,
    }));
}
