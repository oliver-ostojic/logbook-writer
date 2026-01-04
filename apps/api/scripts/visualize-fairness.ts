/**
 * Fairness Distribution Visualizer
 * 
 * Generates an HTML file with:
 * 1. Histogram: Distribution of minutes per crew for each role
 * 2. Lorenz Curve: Visual representation of Gini coefficient
 * 3. Summary stats table
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
const LOOKBACK_DAYS = 31;

interface CrewRoleData {
  crewId: string;
  crewName: string;
  minutesAssigned: number;
  hoursWorked: number;
  minutesPerHour: number;
}

interface RoleDistribution {
  roleId: number;
  roleName: string;
  crewData: CrewRoleData[];
  giniCoefficient: number;
  stats: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    totalCrew: number;
    crewWithMinutes: number;
  };
}

function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return numerator / (n * sum);
}

function calculateLorenzCurve(values: number[]): { x: number; y: number }[] {
  if (values.length === 0) return [{ x: 0, y: 0 }, { x: 100, y: 100 }];
  
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total === 0) return [{ x: 0, y: 0 }, { x: 100, y: 100 }];
  
  const points: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  let cumSum = 0;
  
  for (let i = 0; i < sorted.length; i++) {
    cumSum += sorted[i];
    points.push({
      x: ((i + 1) / sorted.length) * 100,
      y: (cumSum / total) * 100,
    });
  }
  
  return points;
}

async function getRoleDistributions(): Promise<RoleDistribution[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - LOOKBACK_DAYS);
  
  // Get role names
  const roles = await prisma.role.findMany({
    where: { id: { in: TRACKED_ROLE_IDS } },
    select: { id: true, displayName: true },
  });
  const roleNames = new Map(roles.map(r => [r.id, r.displayName]));
  
  // Get crew names
  const crew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    select: { id: true, name: true },
  });
  const crewNames = new Map(crew.map(c => [c.id, c.name]));
  
  // Get eligible crew for each role
  const crewRoles = await prisma.crewRole.findMany({
    where: { 
      Crew: { storeId: STORE_ID },
      roleId: { in: TRACKED_ROLE_IDS },
    },
    select: { crewId: true, roleId: true },
  });
  const eligibleCrewByRole = new Map<number, Set<string>>();
  for (const cr of crewRoles) {
    if (!eligibleCrewByRole.has(cr.roleId)) {
      eligibleCrewByRole.set(cr.roleId, new Set());
    }
    eligibleCrewByRole.get(cr.roleId)!.add(cr.crewId);
  }
  
  // Get fairness history
  const history = await prisma.crewRoleFairnessHistory.findMany({
    where: {
      storeId: STORE_ID,
      roleId: { in: TRACKED_ROLE_IDS },
      date: { gte: cutoffDate },
    },
  });
  
  // Get shift history for hours worked
  const shifts = await prisma.shift.findMany({
    where: {
      storeId: STORE_ID,
      date: { gte: cutoffDate },
    },
  });
  
  // Calculate hours worked per crew
  const crewHoursWorked = new Map<string, number>();
  for (const shift of shifts) {
    const minutes = Math.max(0, shift.endMin - shift.startMin);
    const current = crewHoursWorked.get(shift.crewId) || 0;
    crewHoursWorked.set(shift.crewId, current + minutes / 60);
  }
  
  // Aggregate minutes by role and crew
  const minutesByRoleCrew = new Map<string, number>();
  for (const record of history) {
    const key = `${record.roleId}:${record.crewId}`;
    const current = minutesByRoleCrew.get(key) || 0;
    minutesByRoleCrew.set(key, current + record.minutesAssigned);
  }
  
  const distributions: RoleDistribution[] = [];
  
  for (const roleId of TRACKED_ROLE_IDS) {
    const eligibleCrew = eligibleCrewByRole.get(roleId) || new Set();
    const crewData: CrewRoleData[] = [];
    
    for (const crewId of eligibleCrew) {
      const key = `${roleId}:${crewId}`;
      const minutesAssigned = minutesByRoleCrew.get(key) || 0;
      const hoursWorked = crewHoursWorked.get(crewId) || 0;
      const minutesPerHour = hoursWorked > 0 ? minutesAssigned / hoursWorked : 0;
      
      crewData.push({
        crewId,
        crewName: crewNames.get(crewId) || crewId,
        minutesAssigned,
        hoursWorked,
        minutesPerHour,
      });
    }
    
    // Sort by minutes assigned for display
    crewData.sort((a, b) => b.minutesAssigned - a.minutesAssigned);
    
    // Calculate stats
    const minutes = crewData.map(c => c.minutesAssigned);
    const nonZeroMinutes = minutes.filter(m => m > 0);
    const mean = minutes.length > 0 ? minutes.reduce((a, b) => a + b, 0) / minutes.length : 0;
    const sorted = [...minutes].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const variance = minutes.length > 0 
      ? minutes.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) / minutes.length 
      : 0;
    const stdDev = Math.sqrt(variance);
    
    distributions.push({
      roleId,
      roleName: roleNames.get(roleId) || `Role ${roleId}`,
      crewData,
      giniCoefficient: calculateGini(minutes),
      stats: {
        min: Math.min(...minutes),
        max: Math.max(...minutes),
        mean,
        median,
        stdDev,
        totalCrew: minutes.length,
        crewWithMinutes: nonZeroMinutes.length,
      },
    });
  }
  
  return distributions;
}

function generateHTML(distributions: RoleDistribution[]): string {
  const roleCharts = distributions.map(dist => {
    // Create histogram data (buckets of 15 minutes)
    const bucketSize = 15;
    const maxMinutes = Math.ceil(dist.stats.max / bucketSize) * bucketSize;
    const buckets: { range: string; count: number }[] = [];
    
    for (let i = 0; i <= maxMinutes; i += bucketSize) {
      const count = dist.crewData.filter(c => 
        c.minutesAssigned >= i && c.minutesAssigned < i + bucketSize
      ).length;
      buckets.push({ range: `${i}-${i + bucketSize}`, count });
    }
    
    // Lorenz curve points
    const lorenzPoints = calculateLorenzCurve(dist.crewData.map(c => c.minutesAssigned));
    
    // Top 10 crew for the table
    const topCrew = dist.crewData.slice(0, 10);
    const bottomCrew = dist.crewData.filter(c => c.minutesAssigned === 0).slice(0, 5);
    
    return `
      <div class="role-section">
        <h2>${dist.roleName}</h2>
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-value">${dist.giniCoefficient.toFixed(3)}</div>
            <div class="stat-label">Gini Coefficient</div>
            <div class="stat-note">${dist.giniCoefficient < 0.3 ? '✅ Good' : dist.giniCoefficient < 0.5 ? '⚠️ Moderate' : '❌ High inequality'}</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${dist.stats.crewWithMinutes}/${dist.stats.totalCrew}</div>
            <div class="stat-label">Crew with Assignments</div>
            <div class="stat-note">${((dist.stats.crewWithMinutes / dist.stats.totalCrew) * 100).toFixed(0)}% participation</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${dist.stats.mean.toFixed(1)} min</div>
            <div class="stat-label">Mean per Crew</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${dist.stats.median.toFixed(1)} min</div>
            <div class="stat-label">Median</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${dist.stats.max.toFixed(0)} min</div>
            <div class="stat-label">Max</div>
          </div>
        </div>
        
        <div class="charts-row">
          <div class="chart-container">
            <h3>Distribution (Histogram)</h3>
            <canvas id="histogram-${dist.roleId}"></canvas>
          </div>
          <div class="chart-container">
            <h3>Lorenz Curve (Inequality)</h3>
            <canvas id="lorenz-${dist.roleId}"></canvas>
          </div>
        </div>
        
        <div class="tables-row">
          <div class="table-container">
            <h3>Top 10 Assigned</h3>
            <table>
              <thead><tr><th>Crew</th><th>Minutes</th><th>Hours Worked</th><th>Min/Hour</th></tr></thead>
              <tbody>
                ${topCrew.map(c => `
                  <tr>
                    <td>${c.crewName}</td>
                    <td>${c.minutesAssigned.toFixed(0)}</td>
                    <td>${c.hoursWorked.toFixed(1)}</td>
                    <td>${c.minutesPerHour.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="table-container">
            <h3>Crew with 0 Minutes (${dist.crewData.filter(c => c.minutesAssigned === 0).length} total)</h3>
            <table>
              <thead><tr><th>Crew</th><th>Hours Worked</th></tr></thead>
              <tbody>
                ${bottomCrew.map(c => `
                  <tr>
                    <td>${c.crewName}</td>
                    <td>${c.hoursWorked.toFixed(1)}</td>
                  </tr>
                `).join('')}
                ${dist.crewData.filter(c => c.minutesAssigned === 0).length > 5 ? '<tr><td colspan="2">...</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <script>
        // Histogram
        new Chart(document.getElementById('histogram-${dist.roleId}'), {
          type: 'bar',
          data: {
            labels: ${JSON.stringify(buckets.map(b => b.range))},
            datasets: [{
              label: 'Number of Crew',
              data: ${JSON.stringify(buckets.map(b => b.count))},
              backgroundColor: 'rgba(54, 162, 235, 0.6)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { title: { display: true, text: 'Minutes Assigned' } },
              y: { title: { display: true, text: 'Number of Crew' }, beginAtZero: true }
            }
          }
        });
        
        // Lorenz Curve
        new Chart(document.getElementById('lorenz-${dist.roleId}'), {
          type: 'line',
          data: {
            datasets: [
              {
                label: 'Perfect Equality',
                data: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
                borderColor: 'rgba(200, 200, 200, 1)',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
              },
              {
                label: 'Actual Distribution',
                data: ${JSON.stringify(lorenzPoints)},
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                pointRadius: 0,
                fill: true
              }
            ]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  label: (ctx) => \`\${ctx.dataset.label}: \${ctx.parsed.y.toFixed(1)}% of minutes to \${ctx.parsed.x.toFixed(1)}% of crew\`
                }
              }
            },
            scales: {
              x: { type: 'linear', min: 0, max: 100, title: { display: true, text: '% of Crew (sorted by assignment)' } },
              y: { min: 0, max: 100, title: { display: true, text: '% of Total Minutes' } }
            }
          }
        });
      </script>
    `;
  }).join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Fairness Distribution - Store ${STORE_ID}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    .role-section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .role-section h2 { margin-top: 0; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
    .stats-row { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 20px; }
    .stat-box { background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1e40af; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 5px; }
    .stat-note { font-size: 11px; color: #94a3b8; margin-top: 3px; }
    .charts-row { display: flex; gap: 20px; margin-bottom: 20px; }
    .chart-container { flex: 1; min-width: 300px; }
    .chart-container h3 { margin-top: 0; color: #475569; }
    .tables-row { display: flex; gap: 20px; }
    .table-container { flex: 1; }
    .table-container h3 { margin-top: 0; color: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f1f5f9; font-weight: 600; }
    tr:hover { background: #f8fafc; }
    .generated { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <h1>📊 Fairness Distribution - Store ${STORE_ID}</h1>
  <p>Lookback period: ${LOOKBACK_DAYS} days | Generated: ${new Date().toLocaleString()}</p>
  
  ${roleCharts}
  
  <div class="generated">
    <p><strong>How to read the Lorenz Curve:</strong></p>
    <p>The diagonal dashed line represents perfect equality (everyone gets equal minutes).</p>
    <p>The red area between the curve and the diagonal represents inequality - larger area = more unequal.</p>
    <p>Gini coefficient = 2 × (area between curve and diagonal). Range: 0 (perfect equality) to 1 (maximum inequality).</p>
  </div>
</body>
</html>
  `;
}

async function main(): Promise<void> {
  console.log('Fetching fairness distribution data...');
  
  const distributions = await getRoleDistributions();
  
  console.log('\nGenerating visualization...');
  const html = generateHTML(distributions);
  
  const outputPath = path.join(process.cwd(), 'fairness-distribution.html');
  fs.writeFileSync(outputPath, html);
  
  console.log(`\n✅ Visualization saved to: ${outputPath}`);
  console.log('\nOpen in browser to view charts.');
  
  // Print summary
  console.log('\n📊 Summary:');
  for (const dist of distributions) {
    console.log(`  ${dist.roleName}: Gini=${dist.giniCoefficient.toFixed(3)}, ${dist.stats.crewWithMinutes}/${dist.stats.totalCrew} crew assigned`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
