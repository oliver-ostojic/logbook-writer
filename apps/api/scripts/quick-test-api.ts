/**
 * Quick test to verify API response structure
 */

const API_URL = 'http://localhost:4000';
const STORE_ID = 768;

async function test() {
  console.log('Testing solver API response...\n');
  
  const res = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date: '2025-12-15',
      timeLimitSeconds: 15,
      numWorkers: 4,
      saveLogbook: false,
    }),
  });
  
  const data = await res.json() as Record<string, unknown>;
  
  console.log('Top-level keys:', Object.keys(data));
  console.log('');
  
  const constraintAnalysis = data.constraintAnalysis as Record<string, unknown> | undefined;
  console.log('constraintAnalysis keys:', constraintAnalysis ? Object.keys(constraintAnalysis) : 'N/A');
  console.log('');
  
  const prefSummary = constraintAnalysis?.preferenceSummary as {
    totalPreferences?: number;
    satisfiedPreferences?: number;
  } | undefined;
  
  console.log('preferenceSummary:', JSON.stringify(prefSummary, null, 2));
  console.log('');
  
  // Calculate satisfaction
  let satisfaction = 0;
  if (prefSummary && prefSummary.totalPreferences && prefSummary.totalPreferences > 0) {
    satisfaction = ((prefSummary.satisfiedPreferences ?? 0) / prefSummary.totalPreferences) * 100;
  }
  
  const metadata = data.metadata as { runtimeMs?: number } | undefined;
  const assignments = data.assignments as unknown[] | undefined;
  
  console.log('═══════════════════════════════════════');
  console.log(`Satisfaction: ${satisfaction.toFixed(1)}%`);
  console.log(`Time: ${((metadata?.runtimeMs ?? 0) / 1000).toFixed(1)}s`);
  console.log(`Assignments: ${assignments?.length ?? 0}`);
  console.log('═══════════════════════════════════════');
}

test().catch(console.error);
