import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATE = '2025-12-15';
const API_URL = 'http://localhost:4000';

const TIME_LIMITS = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240];

interface BenchmarkResult {
  timeLimitSeconds: number;
  actualRuntimeMs: number;
  solverStatus: string;
  objectiveScore?: number;
  numAssignments: number;
  eligiblePreferences: number;
  preferencesMet: number;
  percentMet: number;
  avgSatisfaction: number;
  avgSatisfactionPerCrew: number;
  fairnessIndex: number;
  fairnessGrade: string;
  deltaFromPrevious?: {
    percentMetDelta: number;
    avgSatisfactionDelta: number;
    fairnessDelta: number;
    runtimeDelta: number;
  };
}

async function runSolverWithTimeLimit(timeLimitSeconds: number): Promise<{
  solverOutput: any;
  logbookId?: string;
}> {
  console.log('  Running solver with ' + timeLimitSeconds + 's time limit...');
  
  const response = await fetch(API_URL + '/solve-logbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: TEST_DATE,
      store_id: STORE_ID,
      time_limit_seconds: timeLimitSeconds,
    }),
  });

  if (!response.ok) {
    throw new Error('Solver API error: ' + response.status + ' ' + (await response.text()));
  }

  const result = await response.json();
  
  if (!result.ok) {
    throw new Error('Solver failed: ' + result.error);
  }

  return { 
    solverOutput: result.solver,
    logbookId: result.logbookId,
  };
}

async function getPreferenceMetadata(logbookId: string) {
  const metadata = await prisma.logPreferenceMetadata.findUnique({
    where: { logbookId }
  });

  if (!metadata) {
    return null;
  }

  return {
    eligiblePreferences: metadata.eligiblePreferences,
    preferencesMet: metadata.preferencesMet,
    percentMet: metadata.percentMet,
    avgSatisfaction: metadata.avgSatisfaction,
    avgSatisfactionPerCrew: metadata.avgSatisfactionPerCrew,
    fairnessIndex: metadata.fairnessIndex,
    fairnessGrade: metadata.fairnessGrade,
  };
}

async function cleanupLogbook(logbookId: string): Promise<void> {
  try {
    await prisma.assignment.deleteMany({ where: { logbookId } });
    await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId } });
    await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId } });
    await prisma.run.deleteMany({ where: { logbookId } });
    await prisma.logbook.delete({ where: { id: logbookId } });
  } catch (e) {
    // Ignore cleanup errors
  }
}

async function runBenchmark(): Promise<void> {
  console.log('SOLVER TIME LIMIT BENCHMARK');
  console.log('Store: ' + STORE_ID + ', Date: ' + TEST_DATE);
  console.log('Time Limits: ' + TIME_LIMITS[0] + 's to ' + TIME_LIMITS[TIME_LIMITS.length - 1] + 's (' + TIME_LIMITS.length + ' runs)\n');

  const results: BenchmarkResult[] = [];

  for (let i = 0; i < TIME_LIMITS.length; i++) {
    const timeLimit = TIME_LIMITS[i];
    console.log('\nTest ' + (i + 1) + '/' + TIME_LIMITS.length + ': ' + timeLimit + 's time limit');

    try {
      const { solverOutput, logbookId } = await runSolverWithTimeLimit(timeLimit);

      let stats = {
        eligiblePreferences: 0,
        preferencesMet: 0,
        percentMet: 0,
        avgSatisfaction: 0,
        avgSatisfactionPerCrew: 0,
        fairnessIndex: 0,
        fairnessGrade: 'F',
      };

      if (logbookId) {
        const metadata = await getPreferenceMetadata(logbookId);
        if (metadata) {
          stats = metadata;
        }
      }

      const result: BenchmarkResult = {
        timeLimitSeconds: timeLimit,
        actualRuntimeMs: solverOutput.metadata?.runtimeMs ?? 0,
        solverStatus: solverOutput.metadata?.status ?? 'UNKNOWN',
        objectiveScore: solverOutput.metadata?.objectiveScore,
        numAssignments: solverOutput.assignments?.length ?? 0,
        ...stats,
      };

      if (results.length > 0) {
        const prev = results[results.length - 1];
        result.deltaFromPrevious = {
          percentMetDelta: result.percentMet - prev.percentMet,
          avgSatisfactionDelta: result.avgSatisfaction - prev.avgSatisfaction,
          fairnessDelta: result.fairnessIndex - prev.fairnessIndex,
          runtimeDelta: result.actualRuntimeMs - prev.actualRuntimeMs,
        };
      }

      results.push(result);

      console.log('  Status: ' + result.solverStatus + ', Runtime: ' + (result.actualRuntimeMs / 1000).toFixed(1) + 's');
      console.log('  Assignments: ' + result.numAssignments + ', Objective: ' + (result.objectiveScore ?? 'N/A'));
      console.log('  Prefs: ' + result.preferencesMet + '/' + result.eligiblePreferences + ' (' + result.percentMet.toFixed(1) + '%)');
      console.log('  Avg Sat: ' + result.avgSatisfaction.toFixed(1) + '%, Fairness: ' + result.fairnessIndex.toFixed(1) + '% (' + result.fairnessGrade + ')');
      
      if (result.deltaFromPrevious) {
        const d = result.deltaFromPrevious;
        console.log('  Delta: %Met ' + (d.percentMetDelta >= 0 ? '+' : '') + d.percentMetDelta.toFixed(2) + '%, Sat ' + (d.avgSatisfactionDelta >= 0 ? '+' : '') + d.avgSatisfactionDelta.toFixed(2) + '%');
      }

      if (logbookId) {
        await cleanupLogbook(logbookId);
      }

    } catch (error) {
      console.error('  Error: ' + (error as Error).message);
      results.push({
        timeLimitSeconds: timeLimit,
        actualRuntimeMs: 0,
        solverStatus: 'ERROR',
        numAssignments: 0,
        eligiblePreferences: 0,
        preferencesMet: 0,
        percentMet: 0,
        avgSatisfaction: 0,
        avgSatisfactionPerCrew: 0,
        fairnessIndex: 0,
        fairnessGrade: 'F',
      });
    }
  }

  console.log('\n\nBENCHMARK RESULTS SUMMARY');
  console.log('Time   | Actual | Status    | Obj Score | % Met   | D% Met  | Avg Sat | D Sat   | Fair    | Grade');
  console.log('-------|--------|-----------|-----------|---------|---------|---------|---------|---------|------');

  for (const r of results) {
    const time = (r.timeLimitSeconds + 's').padEnd(5);
    const actual = ((r.actualRuntimeMs / 1000).toFixed(0) + 's').padEnd(6);
    const status = r.solverStatus.substring(0, 9).padEnd(9);
    const obj = r.objectiveScore ? r.objectiveScore.toString().padStart(9) : '      N/A';
    const pctMet = (r.percentMet.toFixed(1) + '%').padStart(7);
    const deltaMet = r.deltaFromPrevious 
      ? ((r.deltaFromPrevious.percentMetDelta >= 0 ? '+' : '') + r.deltaFromPrevious.percentMetDelta.toFixed(1) + '%').padStart(7)
      : '      -';
    const avgSat = (r.avgSatisfaction.toFixed(1) + '%').padStart(7);
    const deltaSat = r.deltaFromPrevious
      ? ((r.deltaFromPrevious.avgSatisfactionDelta >= 0 ? '+' : '') + r.deltaFromPrevious.avgSatisfactionDelta.toFixed(1) + '%').padStart(7)
      : '      -';
    const fairness = (r.fairnessIndex.toFixed(1) + '%').padStart(7);
    const grade = r.fairnessGrade.padStart(5);

    console.log(time + ' | ' + actual + ' | ' + status + ' | ' + obj + ' | ' + pctMet + ' | ' + deltaMet + ' | ' + avgSat + ' | ' + deltaSat + ' | ' + fairness + ' | ' + grade);
  }

  console.log('\n\nANALYSIS:');
  
  let recommendedTime = TIME_LIMITS[0];
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    if (r.deltaFromPrevious && r.solverStatus !== 'ERROR') {
      const gain = r.deltaFromPrevious.avgSatisfactionDelta;
      if (gain < 0.5) {
        console.log('Diminishing returns at ' + r.timeLimitSeconds + 's (only +' + gain.toFixed(2) + '% improvement)');
        recommendedTime = results[i - 1].timeLimitSeconds;
        break;
      }
    }
    recommendedTime = r.timeLimitSeconds;
  }

  console.log('Recommended time limit: ' + recommendedTime + 's');
  
  const validResults = results.filter(r => r.solverStatus !== 'ERROR');
  if (validResults.length > 0) {
    const best = validResults.reduce((a, b) => a.avgSatisfaction > b.avgSatisfaction ? a : b);
    console.log('Best result at ' + best.timeLimitSeconds + 's: ' + best.percentMet.toFixed(1) + '% met, ' + best.avgSatisfaction.toFixed(1) + '% avg sat, ' + best.fairnessIndex.toFixed(1) + '% fairness');
  }

  const outputPath = './benchmark-results-' + TEST_DATE + '.json';
  const fs = require('fs');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log('\nResults saved to: ' + outputPath);
}

runBenchmark()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
