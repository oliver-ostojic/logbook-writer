import fs from 'fs';
import path from 'path';

interface CrewRecord {
  id: string;
  prefFirstHour?: string;
  prefTask?: string;
  prefBreakTiming?: number; // -1 early, 1 late, undefined none
}

function main() {
  const file = path.resolve(process.cwd(), '../../crew_roles_export.json');
  const raw = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(raw);
  const crews: CrewRecord[] = parsed.crews;

  const total = crews.length;

  const firstHourCounts: Record<string, number> = {};
  const taskCounts: Record<string, number> = {};
  let breakEarly = 0, breakLate = 0, breakNone = 0;

  for (const c of crews) {
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

  const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%';

  console.log('Crew preference distribution from export:\n');
  console.log(`Total crew records: ${total}`);
  console.log('\nFirst Hour Preference:');
  Object.entries(firstHourCounts).forEach(([k,v]) => console.log(`  ${k.padEnd(8)} ${v.toString().padStart(3)} (${pct(v)})`));
  console.log('\nTask Preference:');
  Object.entries(taskCounts).forEach(([k,v]) => console.log(`  ${k.padEnd(8)} ${v.toString().padStart(3)} (${pct(v)})`));
  console.log('\nBreak Timing Preference:');
  console.log(`  EARLY    ${breakEarly.toString().padStart(3)} (${pct(breakEarly)})`);
  console.log(`  LATE     ${breakLate.toString().padStart(3)} (${pct(breakLate)})`);
  console.log(`  NONE     ${breakNone.toString().padStart(3)} (${pct(breakNone)})`);

  // Proposed normalized percentages you can tweak
  console.log('\nProposed baseline percentages (editable):');
  console.log('  firstHour: PRODUCT ~?, REGISTER ~?');
  console.log('  task: PRODUCT ~?, REGISTER ~?');
  console.log('  break: EARLY ~?, LATE ~?, NONE ~?');
  console.log('\nReply with the exact percentages (or counts) you want and I will seed accordingly.');
}

main();
