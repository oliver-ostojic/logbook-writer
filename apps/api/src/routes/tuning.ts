import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Query params contract
// mode: 'rarity' | 'popularity' (how to scale weights)
// storeId?: number (limit crew to a store)
// min?: number (minimum weight bound, default 0)
// max?: number (maximum weight bound, default 100)
// penaltyScale?: number (scale for consecutive weight suggestions, default 10)

type TuningQuery = {
  mode?: string;
  storeId?: string;
  min?: string;
  max?: string;
  penaltyScale?: string;
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function computeWeight(proportion: number, min: number, max: number, mode: 'rarity' | 'popularity') {
  const span = max - min;
  if (span <= 0) return min;
  if (mode === 'rarity') {
    // Higher weight for rarer preferences
    return Math.round(min + (1 - proportion) * span);
  }
  // popularity: higher weight for more common preferences
  return Math.round(min + proportion * span);
}

export function registerTuningRoutes(app: FastifyInstance) {
  app.get<{ Querystring: TuningQuery }>('/tuning/preferences', async (req, reply) => {
    const { mode = 'rarity', storeId, min = '0', max = '100', penaltyScale = '10' } = req.query;
    if (mode !== 'rarity' && mode !== 'popularity') {
      return reply.code(400).send({ error: 'mode must be rarity or popularity' });
    }
    const minNum = clamp(parseInt(min, 10) || 0, 0, 10_000);
    const maxNum = clamp(parseInt(max, 10) || 100, minNum, 10_000);
    const penaltyScaleNum = clamp(parseInt(penaltyScale, 10) || 10, 0, 10_000);

    const crewWhere = storeId ? { storeId: parseInt(storeId, 10) || -1 } : undefined;
  // Fetch crew (model name assumed 'crew' per existing routes)
    // Support legacy naming differences (crew vs crewMember)
    const crewModel: any = (prisma as any).crew ?? (prisma as any).crewMember;
    if (!crewModel) {
      return reply.code(500).send({ error: 'Crew model not found on Prisma client' });
    }
    const crew = await crewModel.findMany({ where: crewWhere });
    if (!crew.length) {
      return reply.code(404).send({ error: 'No crew found for provided filter' });
    }

    const total = crew.length;

    // Aggregations
    const firstHourCounts: Record<string, number> = {};
    const taskCounts: Record<string, number> = {};
    let breakEarly = 0; // -1
    let breakLate = 0; // +1
    let breakNone = 0; // null

    for (const c of crew) {
      if (c.prefFirstHour) {
        firstHourCounts[c.prefFirstHour] = (firstHourCounts[c.prefFirstHour] || 0) + 1;
      } else {
        firstHourCounts['NONE'] = (firstHourCounts['NONE'] || 0) + 1;
      }
      if (c.prefTask) {
        taskCounts[c.prefTask] = (taskCounts[c.prefTask] || 0) + 1;
      } else {
        taskCounts['NONE'] = (taskCounts['NONE'] || 0) + 1;
      }
      if (c.prefBreakTiming === -1) breakEarly++; else if (c.prefBreakTiming === 1) breakLate++; else breakNone++;
    }

  // Preference task enum values (hard-coded to avoid client enum mismatch issues)
  const enumValues = ['REGISTER', 'PRODUCT'] as const;

    function buildRecommendation(counts: Record<string, number>) {
      const rec: Record<string, number> = {};
      for (const val of enumValues) {
        const count = counts[val] || 0;
        const proportion = count / total;
        rec[val] = computeWeight(proportion, minNum, maxNum, mode as 'rarity' | 'popularity');
      }
      return rec;
    }

    const firstHourRecs = buildRecommendation(firstHourCounts);
    const taskRecs = buildRecommendation(taskCounts);

    // Break timing recommendations (only two signed states)
    const breakEarlyProp = breakEarly / total;
    const breakLateProp = breakLate / total;
    const breakTimingRecommendations = {
      early: computeWeight(breakEarlyProp, minNum, maxNum, mode as 'rarity' | 'popularity'),
      late: computeWeight(breakLateProp, minNum, maxNum, mode as 'rarity' | 'popularity'),
    };

    // Consecutive penalties heuristic: derive from PRODUCT vs REGISTER proportions
    const productProp = (taskCounts['PRODUCT'] || 0) / total;
    const registerProp = (taskCounts['REGISTER'] || 0) / total;
    let consecutiveProductPenalty: number;
    let consecutiveRegisterPenalty: number;
    if (mode === 'rarity') {
      // Penalize switching more for the rarer task to preserve scarce continuity
      consecutiveProductPenalty = Math.round(productProp < registerProp ? penaltyScaleNum : penaltyScaleNum / 2);
      consecutiveRegisterPenalty = Math.round(registerProp < productProp ? penaltyScaleNum : penaltyScaleNum / 2);
    } else {
      // popularity: emphasize continuity for popular task (higher penalty on switches of popular task)
      consecutiveProductPenalty = Math.round(productProp >= registerProp ? penaltyScaleNum : penaltyScaleNum / 2);
      consecutiveRegisterPenalty = Math.round(registerProp >= productProp ? penaltyScaleNum : penaltyScaleNum / 2);
    }

    const response = {
      storeId: crewWhere?.storeId ?? null,
      totalCrew: total,
      mode,
      bounds: { min: minNum, max: maxNum },
      generatedAt: new Date().toISOString(),
      dimensions: {
        prefFirstHour: {
          counts: firstHourCounts,
          recommendations: firstHourRecs,
        },
        prefTask: {
          counts: taskCounts,
          recommendations: taskRecs,
        },
        prefBreakTiming: {
          counts: { early: breakEarly, late: breakLate, none: breakNone },
          recommendations: breakTimingRecommendations,
        },
        consecutive: {
          suggestions: {
            consecutiveProdWeight: consecutiveProductPenalty,
            consecutiveRegWeight: consecutiveRegisterPenalty,
          },
          reasoning: 'Heuristic based on relative PRODUCT vs REGISTER proportions and selected mode.'
        }
      }
    };
    return response;
  });
}
