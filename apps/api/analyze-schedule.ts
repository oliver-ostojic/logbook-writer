import fs from 'fs';

interface Assignment {
  crewId: string;
  taskType: string;
  startTime: number;
  endTime: number;
}

interface SolverOutput {
  metadata: {
    status: string;
    numAssignments: number;
    runtimeMs: number;
  };
  assignments: Assignment[];
}

interface CrewSummary {
  crewId: string;
  totalSlots: number;
  totalHours: number;
  roles: Record<string, { slots: number; hours: number }>;
}

interface Preference {
  crewId: string;
  preferenceType: string;
  roleCode?: string;
  baseWeight: number;
  crewWeight: number;
}

interface SatisfactionScore {
  crewId: string;
  totalPreferences: number;
  metPreferences: number;
  satisfactionRate: number;
  weightedSatisfaction: number;
  totalWeight: number;
}

const solverOutput: SolverOutput = JSON.parse(
  fs.readFileSync('solver_output_11_22_clean.json', 'utf-8')
);

// Get crew input to get names and preferences
const solverInput = JSON.parse(
  fs.readFileSync('solver_input_11_22.json', 'utf-8')
);

const crewNameMap: Record<string, string> = {};
for (const crew of solverInput.crew) {
  crewNameMap[crew.id] = crew.name;
}

const preferences: Preference[] = solverInput.preferences || [];

// Group assignments by crew
const crewMap = new Map<string, Assignment[]>();
for (const assignment of solverOutput.assignments) {
  if (!crewMap.has(assignment.crewId)) {
    crewMap.set(assignment.crewId, []);
  }
  crewMap.get(assignment.crewId)!.push(assignment);
}

// Analyze each crew
const crewSummaries: CrewSummary[] = [];

for (const [crewId, assignments] of crewMap.entries()) {
  const roleMap: Record<string, { slots: number; hours: number }> = {};
  
  for (const assignment of assignments) {
    if (!roleMap[assignment.taskType]) {
      roleMap[assignment.taskType] = { slots: 0, hours: 0 };
    }
    roleMap[assignment.taskType].slots += 1;
    roleMap[assignment.taskType].hours += 0.5;
  }
  
  const totalSlots = assignments.length;
  const totalHours = totalSlots * 0.5;
  
  crewSummaries.push({
    crewId,
    totalSlots,
    totalHours,
    roles: roleMap,
  });
}

// Sort by crew ID
crewSummaries.sort((a, b) => a.crewId.localeCompare(b.crewId));

console.log('\n' + '='.repeat(80));
console.log('SCHEDULE ANALYSIS - 11/22/2025');
console.log('='.repeat(80));
console.log(`Status: ${solverOutput.metadata.status}`);
console.log(`Runtime: ${solverOutput.metadata.runtimeMs}ms`);
console.log(`Total Assignments: ${solverOutput.metadata.numAssignments}`);
console.log(`Crew with Assignments: ${crewSummaries.length}`);
console.log('='.repeat(80));

// Print each crew's breakdown
for (const summary of crewSummaries) {
  const crewName = crewNameMap[summary.crewId] || summary.crewId;
  console.log(`\n${crewName} (${summary.crewId}) - ${summary.totalHours}h total:`);
  
  // Sort roles by slots descending
  const sortedRoles = Object.entries(summary.roles)
    .sort((a, b) => b[1].slots - a[1].slots);
  
  for (const [role, stats] of sortedRoles) {
    console.log(`  ${role.padEnd(15)} ${stats.slots.toString().padStart(2)} slots (${stats.hours}h)`);
  }
}

// Summary by role across all crew
console.log('\n' + '='.repeat(80));
console.log('ROLE TOTALS');
console.log('='.repeat(80));

const roleTotals: Record<string, { slots: number; hours: number; crewCount: number }> = {};
for (const summary of crewSummaries) {
  for (const [role, stats] of Object.entries(summary.roles)) {
    if (!roleTotals[role]) {
      roleTotals[role] = { slots: 0, hours: 0, crewCount: 0 };
    }
    roleTotals[role].slots += stats.slots;
    roleTotals[role].hours += stats.hours;
    roleTotals[role].crewCount += 1;
  }
}

const sortedRoleTotals = Object.entries(roleTotals)
  .sort((a, b) => b[1].slots - a[1].slots);

for (const [role, stats] of sortedRoleTotals) {
  console.log(
    `${role.padEnd(15)} ${stats.slots.toString().padStart(4)} slots (${stats.hours.toString().padStart(6)}h) across ${stats.crewCount.toString().padStart(2)} crew`
  );
}
console.log('='.repeat(80));

// Calculate preference satisfaction
console.log('\n' + '='.repeat(80));
console.log('PREFERENCE SATISFACTION ANALYSIS');
console.log('='.repeat(80));

const satisfactionScores: SatisfactionScore[] = [];

// Group preferences by crew
const prefByCrew = new Map<string, Preference[]>();
for (const pref of preferences) {
  if (!prefByCrew.has(pref.crewId)) {
    prefByCrew.set(pref.crewId, []);
  }
  prefByCrew.get(pref.crewId)!.push(pref);
}

// Group assignments by crew
const assignmentsByCrew = new Map<string, Assignment[]>();
for (const assignment of solverOutput.assignments) {
  if (!assignmentsByCrew.has(assignment.crewId)) {
    assignmentsByCrew.set(assignment.crewId, []);
  }
  assignmentsByCrew.get(assignment.crewId)!.push(assignment);
}

// Calculate satisfaction for each crew
for (const crewId of Object.keys(crewNameMap)) {
  const crewPrefs = prefByCrew.get(crewId) || [];
  const crewAssignments = assignmentsByCrew.get(crewId) || [];
  
  if (crewPrefs.length === 0) {
    continue; // Skip crew with no preferences
  }
  
  let metPreferences = 0;
  let totalWeight = 0;
  let metWeight = 0;
  
  for (const pref of crewPrefs) {
    const weight = pref.baseWeight * pref.crewWeight;
    totalWeight += weight;
    
    // Check if preference was met
    let isMet = false;
    
    if (pref.preferenceType === 'FAVORITE' && pref.roleCode) {
      // Check if crew did this task type at all
      isMet = crewAssignments.some(a => a.taskType === pref.roleCode);
    } else if (pref.preferenceType === 'FIRST_HOUR' && pref.roleCode) {
      // Check if first assignment is this task
      const firstAssignment = crewAssignments.sort((a, b) => a.startTime - b.startTime)[0];
      isMet = firstAssignment?.taskType === pref.roleCode;
    }
    
    if (isMet) {
      metPreferences++;
      metWeight += weight;
    }
  }
  
  satisfactionScores.push({
    crewId,
    totalPreferences: crewPrefs.length,
    metPreferences,
    satisfactionRate: crewPrefs.length > 0 ? metPreferences / crewPrefs.length : 0,
    weightedSatisfaction: totalWeight > 0 ? metWeight / totalWeight : 0,
    totalWeight,
  });
}

// Sort by satisfaction rate
satisfactionScores.sort((a, b) => a.weightedSatisfaction - b.weightedSatisfaction);

console.log(`\nTotal Crew with Preferences: ${satisfactionScores.length}`);
console.log(`Total Preferences: ${satisfactionScores.reduce((sum, s) => sum + s.totalPreferences, 0)}`);

const avgSatisfaction = satisfactionScores.reduce((sum, s) => sum + s.weightedSatisfaction, 0) / satisfactionScores.length;
console.log(`Average Weighted Satisfaction: ${(avgSatisfaction * 100).toFixed(1)}%`);

console.log('\nLowest Satisfaction Scores:');
for (let i = 0; i < Math.min(10, satisfactionScores.length); i++) {
  const score = satisfactionScores[i];
  const name = crewNameMap[score.crewId] || score.crewId;
  console.log(
    `  ${name.padEnd(25)} ${score.metPreferences}/${score.totalPreferences} prefs met (${(score.satisfactionRate * 100).toFixed(0)}%) - Weighted: ${(score.weightedSatisfaction * 100).toFixed(1)}%`
  );
}

console.log('\nHighest Satisfaction Scores:');
for (let i = Math.max(0, satisfactionScores.length - 10); i < satisfactionScores.length; i++) {
  const score = satisfactionScores[i];
  const name = crewNameMap[score.crewId] || score.crewId;
  console.log(
    `  ${name.padEnd(25)} ${score.metPreferences}/${score.totalPreferences} prefs met (${(score.satisfactionRate * 100).toFixed(0)}%) - Weighted: ${(score.weightedSatisfaction * 100).toFixed(1)}%`
  );
}

console.log('='.repeat(80));
