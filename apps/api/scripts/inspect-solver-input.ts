import { buildSolverInputV2 } from '../src/solver2/builder';

const [, , storeArg, dateArg] = process.argv;

const storeId = Number(storeArg ?? '1');
if (Number.isNaN(storeId)) {
  throw new Error(`Invalid store id: ${storeArg}`);
}

const date = dateArg ?? new Date().toISOString().slice(0, 10);

(async () => {
  const input = await buildSolverInputV2({ storeId, date });

  const summary = {
    storeId: input.store.id,
    date,
    roles: input.roles.length,
    crew: input.crew.length,
    hourlyRequirements: input.hourlyRequirements.length,
    windowRequirements: input.windowRequirements.length,
    dailyRequirements: input.dailyRequirements.length,
    preferences: input.preferences.length,
    bankedPreferences: input.bankedPreferences.length,
    fairnessTrackers: input.fairnessTrackers.length,
    fairnessHistory: input.fairnessHistory.length,
  };

  console.log('SolverInputV2 summary:', summary);

  console.log('First role descriptor:', input.roles[0]);
  console.log('First preference descriptor:', input.preferences[0]);
  console.log('First fairness history record:', input.fairnessHistory[0]);
})();
