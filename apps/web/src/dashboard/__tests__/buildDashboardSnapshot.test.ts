/**
 * Dashboard Snapshot Builder Tests
 *
 * Comprehensive test suite for buildDashboardSnapshot functionality.
 */

import { describe, it, expect } from 'vitest';
import { buildDashboardSnapshot } from '../buildDashboardSnapshot';
import type { LogbookInput } from '../types';

describe('buildDashboardSnapshot', () => {
  /**
   * Test Case 1: 3 dates, 3 crew, 2 roles, all dates have data
   * Verify ranks are deterministic, averages correct
   */
  it('should handle complete data across 3 dates with 3 crew and 2 roles', () => {
    const logbooks: LogbookInput[] = [
      createLogbook('2025-01-01', [
        createCrew('C001', 'Alice', [
          createShift('s1', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
          createShift('s2', 'R2', 'Product', '2025-01-01T13:00:00Z', '2025-01-01T17:00:00Z', 4, true),
        ]),
        createCrew('C002', 'Bob', [
          createShift('s3', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T15:00:00Z', 3, false),
        ]),
        createCrew('C003', 'Carol', [
          createShift('s4', 'R2', 'Product', '2025-01-01T10:00:00Z', '2025-01-01T16:00:00Z', 5, true),
        ]),
      ], [
        { roleId: 'R1', roleName: 'Register', isEnforced: true },
        { roleId: 'R2', roleName: 'Product', isEnforced: false },
      ]),
      createLogbook('2025-01-02', [
        createCrew('C001', 'Alice', [
          createShift('s5', 'R1', 'Register', '2025-01-02T09:00:00Z', '2025-01-02T14:00:00Z', 5, true),
        ]),
        createCrew('C002', 'Bob', [
          createShift('s6', 'R2', 'Product', '2025-01-02T10:00:00Z', '2025-01-02T16:00:00Z', 4, true),
        ]),
        createCrew('C003', 'Carol', [
          createShift('s7', 'R1', 'Register', '2025-01-02T11:00:00Z', '2025-01-02T15:00:00Z', 3, false),
        ]),
      ], [
        { roleId: 'R1', roleName: 'Register', isEnforced: true },
        { roleId: 'R2', roleName: 'Product', isEnforced: false },
      ]),
      createLogbook('2025-01-03', [
        createCrew('C001', 'Alice', [
          createShift('s8', 'R2', 'Product', '2025-01-03T09:00:00Z', '2025-01-03T13:00:00Z', 4, true),
        ]),
        createCrew('C002', 'Bob', [
          createShift('s9', 'R1', 'Register', '2025-01-03T10:00:00Z', '2025-01-03T14:00:00Z', 5, true),
        ]),
        createCrew('C003', 'Carol', [
          createShift('s10', 'R2', 'Product', '2025-01-03T11:00:00Z', '2025-01-03T17:00:00Z', 5, true),
        ]),
      ], [
        { roleId: 'R1', roleName: 'Register', isEnforced: true },
        { roleId: 'R2', roleName: 'Product', isEnforced: false },
      ]),
    ];

    const snapshot = buildDashboardSnapshot({
      storeId: 'S001',
      timezone: 'America/New_York',
      selectionId: 'test-1',
      selectionLabel: 'Test Case 1',
      selectedDates: ['2025-01-01', '2025-01-02', '2025-01-03'],
      logbooks,
    });

    // Verify metadata
    expect(snapshot.meta.version).toBe(1);
    expect(snapshot.meta.storeId).toBe('S001');
    expect(snapshot.meta.timezone).toBe('America/New_York');

    // Verify selection
    expect(snapshot.selection.selectionId).toBe('test-1');
    expect(snapshot.selection.selectedDates).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
    expect(snapshot.selection.missingDates).toEqual([]);
    expect(snapshot.selection.logbooks).toHaveLength(3);

    // Verify crew rollups
    expect(snapshot.selection.selectionCrewRollups).toHaveLength(3);

    const aliceRollup = snapshot.selection.selectionCrewRollups.find(c => c.crewId === 'C001');
    expect(aliceRollup).toBeDefined();
    expect(aliceRollup!.preferencesTotalSelection).toBe(4); // 2 + 1 + 1 shifts
    expect(aliceRollup!.preferencesMetSelection).toBe(4); // all shifts had preferenceMet = true

    // Verify role rollups
    expect(snapshot.selection.selectionRoleRollups).toHaveLength(2);

    const registerRollup = snapshot.selection.selectionRoleRollups.find(r => r.roleId === 'R1');
    expect(registerRollup).toBeDefined();
    expect(registerRollup!.isEnforced).toBe(true);
    expect(registerRollup!.lorenzCurveData.length).toBeGreaterThan(0);
    expect(registerRollup!.bucketDistribution.length).toBeGreaterThan(0);
  });

  /**
   * Test Case 2: Non-contiguous dates (Jan 1, Jan 3, Jan 7)
   * Verify selection only includes those dates
   */
  it('should handle non-contiguous date selection', () => {
    const logbooks: LogbookInput[] = [
      createLogbook('2025-01-01', [
        createCrew('C001', 'Alice', [
          createShift('s1', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
        ]),
      ], [{ roleId: 'R1', roleName: 'Register', isEnforced: false }]),
      createLogbook('2025-01-03', [
        createCrew('C001', 'Alice', [
          createShift('s2', 'R1', 'Register', '2025-01-03T09:00:00Z', '2025-01-03T13:00:00Z', 4, true),
        ]),
      ], [{ roleId: 'R1', roleName: 'Register', isEnforced: false }]),
      createLogbook('2025-01-07', [
        createCrew('C001', 'Alice', [
          createShift('s3', 'R1', 'Register', '2025-01-07T09:00:00Z', '2025-01-07T13:00:00Z', 5, true),
        ]),
      ], [{ roleId: 'R1', roleName: 'Register', isEnforced: false }]),
    ];

    const snapshot = buildDashboardSnapshot({
      storeId: 'S001',
      timezone: 'UTC',
      selectionId: 'test-2',
      selectionLabel: 'Non-contiguous dates',
      selectedDates: ['2025-01-01', '2025-01-03', '2025-01-07'],
      logbooks,
    });

    // Verify only selected dates are included
    expect(snapshot.selection.selectedDates).toEqual(['2025-01-01', '2025-01-03', '2025-01-07']);
    expect(snapshot.selection.logbooks).toHaveLength(3);
    expect(snapshot.selection.logbooks.map(lb => lb.logbook.date)).toEqual([
      '2025-01-01',
      '2025-01-03',
      '2025-01-07',
    ]);

    // Verify no missing dates (all selected dates have data)
    expect(snapshot.selection.missingDates).toEqual([]);
  });

  /**
   * Test Case 3: One missing date
   * Verify it appears in missingDates, logbooks array excludes it, rollups handle partial data
   */
  it('should handle missing date correctly', () => {
    const logbooks: LogbookInput[] = [
      createLogbook('2025-01-01', [
        createCrew('C001', 'Alice', [
          createShift('s1', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
        ]),
      ], [{ roleId: 'R1', roleName: 'Register', isEnforced: false }]),
      // 2025-01-02 is missing
      createLogbook('2025-01-03', [
        createCrew('C001', 'Alice', [
          createShift('s2', 'R1', 'Register', '2025-01-03T09:00:00Z', '2025-01-03T13:00:00Z', 4, true),
        ]),
      ], [{ roleId: 'R1', roleName: 'Register', isEnforced: false }]),
    ];

    const snapshot = buildDashboardSnapshot({
      storeId: 'S001',
      timezone: 'UTC',
      selectionId: 'test-3',
      selectionLabel: 'Missing date test',
      selectedDates: ['2025-01-01', '2025-01-02', '2025-01-03'],
      logbooks,
    });

    // Verify missing date is identified
    expect(snapshot.selection.missingDates).toEqual(['2025-01-02']);

    // Verify logbooks array only contains dates with data
    expect(snapshot.selection.logbooks).toHaveLength(2);
    expect(snapshot.selection.logbooks.map(lb => lb.logbook.date)).toEqual([
      '2025-01-01',
      '2025-01-03',
    ]);

    // Verify rollups still work with partial data
    const aliceRollup = snapshot.selection.selectionCrewRollups.find(c => c.crewId === 'C001');
    expect(aliceRollup).toBeDefined();
    expect(aliceRollup!.preferencesTotalSelection).toBe(2); // 1 shift per day * 2 days
  });

  /**
   * Test Case 4: Tie scenario
   * Two crew with identical preferencesMetPct. Verify tiebreaker (crewId ascending) produces stable rank
   */
  it('should handle ties with deterministic tiebreaker', () => {
    const logbooks: LogbookInput[] = [
      createLogbook('2025-01-01', [
        createCrew('C002', 'Bob', [
          createShift('s1', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
          createShift('s2', 'R1', 'Register', '2025-01-01T13:00:00Z', '2025-01-01T17:00:00Z', 5, true),
        ]),
        createCrew('C001', 'Alice', [
          createShift('s3', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
          createShift('s4', 'R1', 'Register', '2025-01-01T13:00:00Z', '2025-01-01T17:00:00Z', 5, true),
        ]),
        createCrew('C003', 'Carol', [
          createShift('s5', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 3, false),
        ]),
      ], [{ roleId: 'R1', roleName: 'Register', isEnforced: false }]),
    ];

    const snapshot = buildDashboardSnapshot({
      storeId: 'S001',
      timezone: 'UTC',
      selectionId: 'test-4',
      selectionLabel: 'Tie scenario',
      selectedDates: ['2025-01-01'],
      logbooks,
    });

    // Both C001 and C002 have 100% preferences met (2/2)
    // C003 has 0% preferences met (0/1)
    // Expected ranks: C001 = 1, C002 = 2 (tiebreak by crewId ascending), C003 = 3

    const rollups = snapshot.selection.selectionCrewRollups;
    const c001 = rollups.find(r => r.crewId === 'C001');
    const c002 = rollups.find(r => r.crewId === 'C002');
    const c003 = rollups.find(r => r.crewId === 'C003');

    expect(percentMetInSelection(c001!)).toBe(100);
    expect(percentMetInSelection(c002!)).toBe(100);
    expect(percentMetInSelection(c003!)).toBe(0);

    // Verify tiebreaker: C001 < C002 lexicographically
    expect(c001!.overallRankInSelection).toBe(1);
    expect(c002!.overallRankInSelection).toBe(2);
    expect(c003!.overallRankInSelection).toBe(3);
  });

  /**
   * Test Case 5: Degenerate bucket case
   * All crew have same minutes on a role. Verify single bucket output
   */
  it('should handle degenerate bucket case (all identical values)', () => {
    const logbooks: LogbookInput[] = [
      createLogbook('2025-01-01', [
        createCrew('C001', 'Alice', [
          createShift('s1', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
        ]),
        createCrew('C002', 'Bob', [
          createShift('s2', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
        ]),
        createCrew('C003', 'Carol', [
          createShift('s3', 'R1', 'Register', '2025-01-01T09:00:00Z', '2025-01-01T13:00:00Z', 5, true),
        ]),
      ], [{ roleId: 'R1', roleName: 'Register', isEnforced: false }]),
    ];

    const snapshot = buildDashboardSnapshot({
      storeId: 'S001',
      timezone: 'UTC',
      selectionId: 'test-5',
      selectionLabel: 'Degenerate bucket test',
      selectedDates: ['2025-01-01'],
      logbooks,
    });

    const registerRollup = snapshot.selection.selectionRoleRollups.find(r => r.roleId === 'R1');
    expect(registerRollup).toBeDefined();

    // All crew worked exactly 240 minutes (4 hours)
    // Bucket distribution should have single bucket containing all 3 crew
    expect(registerRollup!.bucketDistribution).toHaveLength(1);
    expect(registerRollup!.bucketDistribution[0].crewCount).toBe(3);
    expect(registerRollup!.bucketDistribution[0].minInclusive).toBe(240);
    expect(registerRollup!.bucketDistribution[0].maxExclusive).toBe(241);
  });

  /**
   * Edge case: Empty logbooks
   */
  it('should handle empty logbooks gracefully', () => {
    const snapshot = buildDashboardSnapshot({
      storeId: 'S001',
      timezone: 'UTC',
      selectionId: 'test-empty',
      selectionLabel: 'Empty test',
      selectedDates: ['2025-01-01', '2025-01-02'],
      logbooks: [],
    });

    expect(snapshot.selection.missingDates).toEqual(['2025-01-01', '2025-01-02']);
    expect(snapshot.selection.logbooks).toHaveLength(0);
    expect(snapshot.selection.selectionCrewRollups).toHaveLength(0);
    expect(snapshot.selection.selectionRoleRollups).toHaveLength(0);
  });
});

// ==================== TEST HELPERS ====================

function createLogbook(
  date: string,
  crew: any[],
  roles: any[]
): LogbookInput {
  return {
    logbookId: `lb-${date}`,
    date,
    storeId: 'S001',
    crew,
    roles,
    aggregateStats: {
      eligiblePreferences: 0,
      preferencesMet: 0,
      percentMet: 0,
      avgSatisfaction: 0,
      avgSatisfactionPerCrew: 0,
      eligibleCrew: 0,
      fairnessIndex: 0,
      fairnessGrade: 'A',
      breakdownByRoleRule: [],
    },
    roleFairnessSnapshots: [],
  };
}

function createCrew(crewId: string, crewName: string, shifts: any[]) {
  return {
    crewId,
    crewName,
    assignments: shifts,
    preferences: {
      total: shifts.length,
      met: shifts.filter(s => s.preferenceMet).length,
      satisfaction:
        shifts.length > 0
          ? shifts.filter(s => s.preferenceMet).length / shifts.length
          : 0,
    },
  };
}

function createShift(
  shiftId: string,
  roleId: string,
  roleName: string,
  startTime: string,
  endTime: string,
  satisfactionScore: number,
  preferenceMet: boolean
) {
  return {
    assignmentId: shiftId,
    roleId,
    roleName,
    startTime,
    endTime,
    preferenceMet,
  };
}

function percentMetInSelection(crew: {
  preferencesMetSelection: number;
  preferencesTotalSelection: number;
}): number {
  if (crew.preferencesTotalSelection === 0) return 0;
  return (crew.preferencesMetSelection / crew.preferencesTotalSelection) * 100;
}
