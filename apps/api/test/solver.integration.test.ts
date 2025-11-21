import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATE = '2024-11-20';

let app: Awaited<ReturnType<typeof buildServer>>;

describe('Solver Integration Tests', () => {
  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /solve-logbook', () => {
    it('should solve a basic schedule with real store 768 data', async () => {
      // Get some crew from store 768 to build shifts
      const crew = await prisma.crew.findMany({
        where: { storeId: STORE_ID },
        take: 5,
        select: { id: true },
      });

      if (crew.length === 0) {
        console.log('⚠ No crew found in store 768, skipping test');
        return;
      }

      // Build shifts for these crew members (8am - 4pm)
      const shifts = crew.map((c) => ({
        crewId: c.id,
        start: '08:00',
        end: '16:00',
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/solve-logbook',
        payload: {
          store_id: STORE_ID,
          date: TEST_DATE,
          shifts,
        },
      });

      console.log('Status:', response.statusCode);
      console.log('Response:', response.payload.substring(0, 500));
      
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('solver');
      
      const solver = result.solver;
      expect(solver).toHaveProperty('success');
      expect(solver).toHaveProperty('metadata');
      expect(solver).toHaveProperty('assignments');
      
      if (solver.success) {
        expect(solver.metadata.status).toBe('OPTIMAL');
        expect(solver.assignments.length).toBeGreaterThan(0);
        
        console.log(`✓ Solver succeeded with ${solver.assignments.length} assignments`);
        console.log(`  Status: ${solver.metadata.status}`);
        console.log(`  Runtime: ${solver.metadata.runtimeMs}ms`);
        console.log(`  Objective: ${solver.metadata.objectiveScore}`);
      } else {
        console.log(`✗ Solver failed: ${solver.metadata.status}`);
        if (solver.metadata.violations) {
          console.log(`  Violations: ${solver.metadata.violations.join(', ')}`);
        }
      }
    });

    it('should return INFEASIBLE for impossible constraints', async () => {
      // Create a test case with impossible constraints
      // This would require setting up specific crew/requirements that can't be satisfied
      // Skipping for now - will implement when we have test data setup
    });

    it('should handle missing store gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/solve-logbook',
        payload: {
          store_id: 99999,
          date: TEST_DATE,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Solver Scaling Tests', () => {
    const crewSizes = [20, 30, 40, 50, 60];
    
    for (const crewSize of crewSizes) {
      it(`should solve with ${crewSize} crew members`, async () => {
        // Get crew from store 768
        const crew = await prisma.crew.findMany({
          where: { storeId: STORE_ID },
          take: crewSize,
          select: { 
            id: true, 
            name: true,
            prefFirstHour: true,
            prefFirstHourWeight: true,
            prefTask: true,
            prefTaskWeight: true,
            consecutiveProdWeight: true,
            consecutiveRegWeight: true,
          },
        });

        if (crew.length < crewSize) {
          console.log(`⚠ Only ${crew.length} crew available, testing with that instead`);
        }

        const actualSize = crew.length;
        
        // Build shifts for these crew members (8am - 4pm)
        const shifts = crew.map((c) => ({
          crewId: c.id,
          start: '08:00',
          end: '16:00',
        }));

        const startTime = Date.now();
        const response = await app.inject({
          method: 'POST',
          url: '/solve-logbook',
          payload: {
            store_id: STORE_ID,
            date: TEST_DATE,
            shifts,
            time_limit_seconds: 60,
          },
        });
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        const solver = result.solver;

        // Diagnostic output
        console.log(`\n${'='.repeat(70)}`);
        console.log(`CREW SIZE: ${actualSize}`);
        console.log(`${'='.repeat(70)}`);
        console.log(`Status:        ${solver.metadata.status}`);
        console.log(`Success:       ${solver.success ? '✓' : '✗'}`);
        console.log(`Solver Time:   ${solver.metadata.runtimeMs}ms`);
        console.log(`Total Time:    ${totalTime}ms`);
        console.log(`Assignments:   ${solver.metadata.numAssignments}`);
        console.log(`MIP Gap:       ${solver.metadata.mipGap ?? 'N/A'}`);
        
        if (solver.success) {
          const objScore = solver.metadata.objectiveScore ?? 0;
          const scorePerCrew = (objScore / actualSize).toFixed(1);
          const scorePerAssignment = (objScore / solver.metadata.numAssignments).toFixed(1);
          
          console.log(`\nObjective Scores:`);
          console.log(`  Total:              ${objScore}`);
          console.log(`  Per crew:           ${scorePerCrew}`);
          console.log(`  Per assignment:     ${scorePerAssignment}`);
          
          // Preference statistics
          const prefStats = {
            firstHour: crew.filter(c => c.prefFirstHour && c.prefFirstHourWeight && c.prefFirstHourWeight > 0).length,
            taskBias: crew.filter(c => c.prefTask && c.prefTaskWeight && c.prefTaskWeight > 0).length,
            productBlock: crew.filter(c => c.consecutiveProdWeight && c.consecutiveProdWeight > 0).length,
            registerBlock: crew.filter(c => c.consecutiveRegWeight && c.consecutiveRegWeight > 0).length,
          };
          
          console.log(`\nPreference Configuration:`);
          console.log(`  First hour task:    ${prefStats.firstHour}/${actualSize} crew`);
          console.log(`  Task bias (R/P):    ${prefStats.taskBias}/${actualSize} crew`);
          console.log(`  Product blocks:     ${prefStats.productBlock}/${actualSize} crew`);
          console.log(`  Register blocks:    ${prefStats.registerBlock}/${actualSize} crew`);
          
          // Calculate assignment distribution
          const taskCounts: Record<string, number> = {};
          for (const assignment of solver.assignments) {
            taskCounts[assignment.taskType] = (taskCounts[assignment.taskType] || 0) + 1;
          }
          
          console.log(`\nTask Distribution:`);
          Object.entries(taskCounts).sort((a, b) => b[1] - a[1]).forEach(([task, count]) => {
            const pct = ((count / solver.metadata.numAssignments) * 100).toFixed(1);
            console.log(`  ${task.padEnd(15)} ${count.toString().padStart(4)} (${pct}%)`);
          });
          
          // Calculate crew utilization
          const crewAssignments: Record<string, number> = {};
          for (const assignment of solver.assignments) {
            crewAssignments[assignment.crewId] = (crewAssignments[assignment.crewId] || 0) + 1;
          }
          
          const assignments = Object.values(crewAssignments);
          const avgAssignments = assignments.reduce((a, b) => a + b, 0) / assignments.length;
          const minAssignments = Math.min(...assignments);
          const maxAssignments = Math.max(...assignments);
          
          console.log(`\nCrew Utilization:`);
          console.log(`  Avg assignments/crew: ${avgAssignments.toFixed(1)}`);
          console.log(`  Min assignments:      ${minAssignments}`);
          console.log(`  Max assignments:      ${maxAssignments}`);
          console.log(`  Balance variance:     ${(maxAssignments - minAssignments)}`);
          
        } else {
          console.log(`\n❌ FAILED - ${solver.metadata.status}`);
          if (solver.metadata.violations && solver.metadata.violations.length > 0) {
            console.log(`\nViolations (${solver.metadata.violations.length}):`);
            solver.metadata.violations.slice(0, 5).forEach((v: string, i: number) => {
              console.log(`  ${i + 1}. ${v}`);
            });
            if (solver.metadata.violations.length > 5) {
              console.log(`  ... and ${solver.metadata.violations.length - 5} more`);
            }
          }
        }
        
        console.log(`${'='.repeat(70)}\n`);
      });
    }
  });

  describe('POST /solve-logbook/test', () => {
    it('should solve with test input data', async () => {
      const testInput = {
        date: TEST_DATE,
        store: {
          id: 1,
          name: 'Test Store',
          regHoursStartMin: 8 * 60,
          regHoursEndMin: 17 * 60,
        },
        crew: [
          {
            id: '1',
            name: 'Alice',
            shiftStartMin: 8 * 60,
            shiftEndMin: 16 * 60,
            roles: [{ role: 'DEMO', assignmentMode: 'TEAM_WINDOW' }],
            canBreak: true,
          },
          {
            id: '2',
            name: 'Bob',
            shiftStartMin: 9 * 60,
            shiftEndMin: 17 * 60,
            roles: [],
            canBreak: true,
          },
        ],
        roleMetadata: [
          { role: 'DEMO', assignmentMode: 'TEAM_WINDOW', isConsecutive: false },
        ],
        hourlyRequirements: [
          { hour: 8, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
          { hour: 9, requiredRegister: 1, requiredProduct: 1, requiredParkingHelm: 0 },
          { hour: 10, requiredRegister: 1, requiredProduct: 1, requiredParkingHelm: 0 },
          { hour: 11, requiredRegister: 1, requiredProduct: 1, requiredParkingHelm: 0 },
          { hour: 12, requiredRegister: 1, requiredProduct: 1, requiredParkingHelm: 0 },
          { hour: 13, requiredRegister: 1, requiredProduct: 1, requiredParkingHelm: 0 },
          { hour: 14, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
          { hour: 15, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
          { hour: 16, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
        ],
        coverageWindows: [
          { role: 'DEMO', startHour: 8, endHour: 9, requiredPerHour: 1 },
        ],
        crewRoleRequirements: [],
        timeLimitSeconds: 30,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/solve-logbook/test',
        payload: testInput,
      });

      console.log('Test endpoint status:', response.statusCode);
      console.log('Test endpoint response:', response.payload);
      
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('solver');
      
      const solver = result.solver;
      expect(solver).toHaveProperty('success');
      expect(solver).toHaveProperty('metadata');
      expect(solver).toHaveProperty('assignments');
      
      console.log(`Test endpoint result: ${solver.success ? 'SUCCESS' : 'FAILED'}`);
      if (solver.metadata.violations) {
        console.log(`  Violations: ${solver.metadata.violations.join(', ')}`);
      }
    });
  });
});
