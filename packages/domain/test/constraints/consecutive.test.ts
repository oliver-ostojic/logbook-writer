/**
 * Tests for CONSECUTIVE preference scorer
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreConsecutivePreferences, 
  scoreCrewConsecutive,
  getConsecutiveSatisfactionSummary,
  countSwitchesWithNewAssignment,
  getLongestConsecutiveBlock,
  getConsecutiveBlocks
} from '../../src/constraints/scorers/consecutive';
import type { SolverAssignment, PreferenceConfig, StoreConfig } from '../../src/constraints/types';

describe('CONSECUTIVE Preference Scorer', () => {
  // Test data
  const storeConfig: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,
    closeMinutesFromMidnight: 1260,
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270
  };

  describe('scoreConsecutivePreferences', () => {
    it('should return 0 score when no CONSECUTIVE preferences exist', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('No CONSECUTIVE preferences');
    });

    it('should give 0 penalty for no switches (all same role)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null, // Penalize all switches
          preferenceType: 'CONSECUTIVE', 
          baseWeight: 10, 
          crewWeight: 5, 
          adaptiveBoost: 1.0
        }
      ];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      expect(result.score).toBe(0); // No switches = no penalty
      expect(result.details).toContain('0 role switches');
    });

    it('should penalize single switch between roles', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Switch!
        { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 660 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'CONSECUTIVE', 
          baseWeight: 10, 
          crewWeight: 5, 
          adaptiveBoost: 1.0
        }
      ];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      // 1 switch * (10 * 5 * 1.0) = 50 penalty
      expect(result.score).toBe(-50);
      expect(result.details).toContain('1 role switches');
    });

    it('should penalize multiple switches', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Switch 1
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 }, // Switch 2
        { crewId: 'CREW001', roleId: 2, startMinutes: 660, endMinutes: 720 }, // Switch 3
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'CONSECUTIVE', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0
        }
      ];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      // 3 switches * (10 * 1 * 1.0) = 30 penalty
      expect(result.score).toBe(-30);
      expect(result.details).toContain('3 role switches');
    });

    it('should only count switches for specific role when roleId is set', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Switch involving role 1
        { crewId: 'CREW001', roleId: 3, startMinutes: 600, endMinutes: 660 }, // Switch NOT involving role 1
        { crewId: 'CREW001', roleId: 2, startMinutes: 660, endMinutes: 720 }, // Switch NOT involving role 1
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: 1, // Only penalize switches involving role 1
          preferenceType: 'CONSECUTIVE', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0
        }
      ];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      // Only 1 switch involves role 1 (1 -> 2)
      expect(result.score).toBe(-10);
    });

    it('should not count switches across gaps (non-consecutive assignments)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        // GAP
        { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 660 }, // Not consecutive, no switch
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'CONSECUTIVE', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0
        }
      ];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      expect(result.score).toBe(0); // Gap means no switch penalty
    });

    it('should apply adaptiveBoost correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // 1 switch
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'CONSECUTIVE', 
          baseWeight: 10, 
          crewWeight: 5, 
          adaptiveBoost: 2.0
        }
      ];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      // 1 switch * (10 * 5 * 2.0) = 100 penalty
      expect(result.score).toBe(-100);
    });

    it('should handle multiple crew independently', () => {
      const assignments: SolverAssignment[] = [
        // CREW001: 1 switch
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 },
        
        // CREW002: 2 switches
        { crewId: 'CREW002', roleId: 1, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW002', roleId: 2, startMinutes: 600, endMinutes: 660 },
        { crewId: 'CREW002', roleId: 1, startMinutes: 660, endMinutes: 720 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1, adaptiveBoost: 1.0 },
      ];
      
      const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
      
      // CREW001: -10, CREW002: -20, Total: -30
      expect(result.score).toBe(-30);
      expect(result.details).toContain('3 role switches');
    });
  });

  describe('scoreCrewConsecutive', () => {
    it('should return 0 when crew has no assignments', () => {
      const assignments: SolverAssignment[] = [];
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewConsecutive(preference, assignments, storeConfig);
      
      expect(result.score).toBe(0);
      expect(result.switches).toBe(0);
      expect(result.consecutiveBlocks).toBe(0);
    });

    it('should return 0 when crew has single assignment', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewConsecutive(preference, assignments, storeConfig);
      
      expect(result.score).toBe(0);
      expect(result.switches).toBe(0);
      expect(result.consecutiveBlocks).toBe(1); // One block
    });

    it('should count consecutive blocks correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 }, // Same role, same block
        { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 660 }, // New role, new block
        { crewId: 'CREW001', roleId: 2, startMinutes: 660, endMinutes: 720 }, // Same role, same block
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewConsecutive(preference, assignments, storeConfig);
      
      expect(result.switches).toBe(1);
      expect(result.consecutiveBlocks).toBe(2); // Two blocks: [1,1], [2,2]
    });
  });

  describe('getConsecutiveSatisfactionSummary', () => {
    it('should provide comprehensive statistics', () => {
      const assignments: SolverAssignment[] = [
        // CREW001: 2 switches
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 },
        
        // CREW002: 0 switches
        { crewId: 'CREW002', roleId: 1, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW002', roleId: 1, startMinutes: 600, endMinutes: 660 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1, adaptiveBoost: 1.0 },
      ];
      
      const summary = getConsecutiveSatisfactionSummary(assignments, preferences, storeConfig);
      
      expect(summary.totalPreferences).toBe(2);
      expect(summary.totalSwitches).toBe(2);
      expect(summary.averageSwitchesPerCrew).toBe(1);
      expect(summary.crewDetails).toHaveLength(2);
      expect(summary.crewDetails[0].switches).toBe(2);
      expect(summary.crewDetails[1].switches).toBe(0);
    });

    it('should handle empty preferences', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const summary = getConsecutiveSatisfactionSummary(assignments, preferences, storeConfig);
      
      expect(summary.totalPreferences).toBe(0);
      expect(summary.totalSwitches).toBe(0);
      expect(summary.totalScore).toBe(0);
      expect(summary.averageSwitchesPerCrew).toBe(0);
    });
  });

  describe('countSwitchesWithNewAssignment', () => {
    it('should return 0 when adding first assignment', () => {
      const newAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const existingAssignments: SolverAssignment[] = [];
      
      const switches = countSwitchesWithNewAssignment(newAssignment, existingAssignments, null, storeConfig);
      
      expect(switches).toBe(0);
    });

    it('should return 0 when adding same role consecutively', () => {
      const newAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 600
      };
      
      const existingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }
      ];
      
      const switches = countSwitchesWithNewAssignment(newAssignment, existingAssignments, null, storeConfig);
      
      expect(switches).toBe(0);
    });

    it('should return 1 when adding different role consecutively', () => {
      const newAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 2,
        startMinutes: 540,
        endMinutes: 600
      };
      
      const existingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }
      ];
      
      const switches = countSwitchesWithNewAssignment(newAssignment, existingAssignments, null, storeConfig);
      
      expect(switches).toBe(1);
    });

    it('should count switches correctly when inserted in middle', () => {
      const newAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 2,
        startMinutes: 540,
        endMinutes: 600
      };
      
      const existingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 }
      ];
      
      const switches = countSwitchesWithNewAssignment(newAssignment, existingAssignments, null, storeConfig);
      
      // 1 -> 2, 2 -> 1 = 2 switches
      expect(switches).toBe(2);
    });
  });

  describe('getLongestConsecutiveBlock', () => {
    it('should return null when no assignments for role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 }
      ];
      
      const result = getLongestConsecutiveBlock('CREW001', 1, assignments);
      
      expect(result).toBeNull();
    });

    it('should return single assignment as block', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }
      ];
      
      const result = getLongestConsecutiveBlock('CREW001', 1, assignments);
      
      expect(result).toEqual({
        duration: 60,
        startMinute: 480,
        endMinute: 540
      });
    });

    it('should find longest consecutive block', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Block 1: 60 min
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 }, // Block 1: now 120 min
        { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 660 }, // Different role
        { crewId: 'CREW001', roleId: 1, startMinutes: 660, endMinutes: 720 }, // Block 2: 60 min
      ];
      
      const result = getLongestConsecutiveBlock('CREW001', 1, assignments);
      
      expect(result).toEqual({
        duration: 120, // Longest is first block
        startMinute: 480,
        endMinute: 600
      });
    });

    it('should handle gaps (non-consecutive assignments)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        // GAP
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 660, endMinutes: 720 }, // Consecutive with previous
      ];
      
      const result = getLongestConsecutiveBlock('CREW001', 1, assignments);
      
      expect(result).toEqual({
        duration: 120, // Second block (600-720)
        startMinute: 600,
        endMinute: 720
      });
    });
  });

  describe('getConsecutiveBlocks', () => {
    it('should return empty array when no assignments', () => {
      const assignments: SolverAssignment[] = [];
      
      const blocks = getConsecutiveBlocks('CREW001', assignments);
      
      expect(blocks).toEqual([]);
    });

    it('should return single block for one assignment', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }
      ];
      
      const blocks = getConsecutiveBlocks('CREW001', assignments);
      
      expect(blocks).toEqual([
        {
          roleId: 1,
          startMinute: 480,
          endMinute: 540,
          duration: 60,
          assignmentCount: 1
        }
      ]);
    });

    it('should merge consecutive same-role assignments into blocks', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 },
      ];
      
      const blocks = getConsecutiveBlocks('CREW001', assignments);
      
      expect(blocks).toEqual([
        {
          roleId: 1,
          startMinute: 480,
          endMinute: 660,
          duration: 180,
          assignmentCount: 3
        }
      ]);
    });

    it('should split blocks on role changes', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 660 }, // Role change
        { crewId: 'CREW001', roleId: 2, startMinutes: 660, endMinutes: 720 },
      ];
      
      const blocks = getConsecutiveBlocks('CREW001', assignments);
      
      expect(blocks).toEqual([
        {
          roleId: 1,
          startMinute: 480,
          endMinute: 600,
          duration: 120,
          assignmentCount: 2
        },
        {
          roleId: 2,
          startMinute: 600,
          endMinute: 720,
          duration: 120,
          assignmentCount: 2
        }
      ]);
    });

    it('should split blocks on gaps', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
        // GAP
        { crewId: 'CREW001', roleId: 1, startMinutes: 660, endMinutes: 720 },
      ];
      
      const blocks = getConsecutiveBlocks('CREW001', assignments);
      
      expect(blocks).toEqual([
        {
          roleId: 1,
          startMinute: 480,
          endMinute: 600,
          duration: 120,
          assignmentCount: 2
        },
        {
          roleId: 1,
          startMinute: 660,
          endMinute: 720,
          duration: 60,
          assignmentCount: 1
        }
      ]);
    });

    it('should handle mixed roles and gaps', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 660 },
        // GAP
        { crewId: 'CREW001', roleId: 1, startMinutes: 720, endMinutes: 780 },
      ];
      
      const blocks = getConsecutiveBlocks('CREW001', assignments);
      
      expect(blocks).toEqual([
        {
          roleId: 1,
          startMinute: 480,
          endMinute: 540,
          duration: 60,
          assignmentCount: 1
        },
        {
          roleId: 2,
          startMinute: 540,
          endMinute: 660,
          duration: 120,
          assignmentCount: 2
        },
        {
          roleId: 1,
          startMinute: 720,
          endMinute: 780,
          duration: 60,
          assignmentCount: 1
        }
      ]);
    });
  });
});
