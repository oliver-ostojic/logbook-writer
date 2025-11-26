/**
 * Tests for TIMING preference scorer
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreTimingPreferences, 
  scoreCrewTiming,
  getTimingSatisfactionSummary,
  getOptimalBreakPosition,
  wouldSatisfyTiming
} from '../../src/constraints/scorers/timing';
import type { SolverAssignment, PreferenceConfig, StoreConfig } from '../../src/constraints/types';

describe('TIMING Preference Scorer', () => {
  // Test data
  const storeConfig: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480, // 8am
    closeMinutesFromMidnight: 1260, // 9pm
    reqShiftLengthForBreak: 360, // 6 hours
    breakWindowStart: 180, // 3 hours from shift start
    breakWindowEnd: 270 // 4.5 hours from shift start
  };

  const breakRoleIds = [99]; // Role ID 99 is a break

  describe('scoreTimingPreferences', () => {
    it('should return 0 score when no TIMING preferences exist', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('No TIMING preferences');
    });

    it('should score early break preference when break is early', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 }, // 8am-11am (3 hrs work)
        { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 }, // 11am-11:30am (break at earliest)
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 }, // 11:30am-3pm (3.5 hrs work)
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 5, 
          adaptiveBoost: 1.0,
          intValue: -1 // Prefer early breaks
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      // Break at 660 = 180 min from start (480)
      // earliestBreakStart = 480 + 180 = 660
      // latestBreakStart = 480 + 270 = 750
      // windowSize = 90
      // breakOffset = 660 - 660 = 0
      // normalizedPosition = 0 / 90 = 0
      // For early preference: satisfactionRate = 1 - 0 = 1.0 (100% satisfied)
      // Score = 1.0 * (10 * 5 * 1.0) = 50
      expect(result.score).toBe(50);
      expect(result.details).toContain('1/1');
    });

    it('should score late break preference when break is late', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 750 }, // 8am-12:30pm (4.5 hrs work)
        { crewId: 'CREW001', roleId: 99, startMinutes: 750, endMinutes: 780 }, // 12:30pm-1pm (break at latest)
        { crewId: 'CREW001', roleId: 1, startMinutes: 780, endMinutes: 900 }, // 1pm-3pm (2 hrs work)
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 5, 
          adaptiveBoost: 1.0,
          intValue: 1 // Prefer late breaks
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      // Break at 750 = 270 min from start (480)
      // earliestBreakStart = 660, latestBreakStart = 750
      // breakOffset = 750 - 660 = 90
      // normalizedPosition = 90 / 90 = 1.0
      // For late preference: satisfactionRate = 1.0 (100% satisfied)
      // Score = 1.0 * (10 * 5 * 1.0) = 50
      expect(result.score).toBe(50);
    });

    it('should give partial score for mid-window break with early preference', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 705 }, // Work
        { crewId: 'CREW001', roleId: 99, startMinutes: 705, endMinutes: 735 }, // Break in middle
        { crewId: 'CREW001', roleId: 1, startMinutes: 735, endMinutes: 900 }, // Work
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0,
          intValue: -1 // Prefer early
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      // Break at 705 = 225 min from start
      // earliestBreakStart = 660, latestBreakStart = 750
      // breakOffset = 705 - 660 = 45
      // normalizedPosition = 45 / 90 = 0.5
      // For early preference: satisfactionRate = 1 - 0.5 = 0.5 (50% satisfied)
      // Score = 0.5 * (10 * 1 * 1.0) = 5
      expect(result.score).toBe(5);
    });

    it('should give low score for late break when early preferred', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 750 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 750, endMinutes: 780 }, // Late break
        { crewId: 'CREW001', roleId: 1, startMinutes: 780, endMinutes: 900 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0,
          intValue: -1 // Prefer early, but got late
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      // normalizedPosition = 1.0 (latest)
      // For early preference: satisfactionRate = 1 - 1.0 = 0
      expect(result.score).toBe(0);
    });

    it('should handle crew without breaks', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 840 }, // 6 hrs but no break
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0,
          intValue: -1
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('1 no break');
    });

    it('should handle crew with shifts too short for breaks', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 }, // Only 3 hrs
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0,
          intValue: -1
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('1 no break');
    });

    it('should handle intValue of 0 (no preference)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 705 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 705, endMinutes: 735 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 735, endMinutes: 900 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 1, 
          adaptiveBoost: 1.0,
          intValue: 0 // No preference
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      expect(result.score).toBe(0);
    });

    it('should apply adaptiveBoost correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 }, // Early break
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: null,
          preferenceType: 'TIMING', 
          baseWeight: 10, 
          crewWeight: 5, 
          adaptiveBoost: 2.0,
          intValue: -1
        }
      ];
      
      const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
      
      // 100% satisfaction * (10 * 5 * 2.0) = 100
      expect(result.score).toBe(100);
    });
  });

  describe('scoreCrewTiming', () => {
    it('should return 0 when crew has no assignments', () => {
      const assignments: SolverAssignment[] = [];
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: -1
      };
      
      const result = scoreCrewTiming(preference, assignments, storeConfig, breakRoleIds);
      
      expect(result.score).toBe(0);
      expect(result.hasBreak).toBe(false);
    });

    it('should calculate correct normalized position for early break', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: -1
      };
      
      const result = scoreCrewTiming(preference, assignments, storeConfig, breakRoleIds);
      
      expect(result.hasBreak).toBe(true);
      expect(result.normalizedPosition).toBe(0); // At earliest possible
    });

    it('should calculate correct normalized position for late break', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 750 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 750, endMinutes: 780 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 780, endMinutes: 900 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: 1
      };
      
      const result = scoreCrewTiming(preference, assignments, storeConfig, breakRoleIds);
      
      expect(result.hasBreak).toBe(true);
      expect(result.normalizedPosition).toBe(1); // At latest possible
    });

    it('should calculate correct normalized position for mid-window break', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 705 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 705, endMinutes: 735 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 735, endMinutes: 900 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: 1
      };
      
      const result = scoreCrewTiming(preference, assignments, storeConfig, breakRoleIds);
      
      expect(result.hasBreak).toBe(true);
      expect(result.normalizedPosition).toBe(0.5); // Exactly in middle
    });
  });

  describe('getTimingSatisfactionSummary', () => {
    it('should provide comprehensive statistics', () => {
      const assignments: SolverAssignment[] = [
        // CREW001: Early break (satisfies early preference)
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 },
        
        // CREW002: Late break (but prefers early - not satisfied)
        { crewId: 'CREW002', roleId: 1, startMinutes: 540, endMinutes: 810 },
        { crewId: 'CREW002', roleId: 99, startMinutes: 810, endMinutes: 840 },
        { crewId: 'CREW002', roleId: 1, startMinutes: 840, endMinutes: 1020 },
        
        // CREW003: No break
        { crewId: 'CREW003', roleId: 1, startMinutes: 600, endMinutes: 780 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'TIMING', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0, intValue: -1 },
        { crewId: 'CREW002', roleId: null, preferenceType: 'TIMING', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0, intValue: -1 },
        { crewId: 'CREW003', roleId: null, preferenceType: 'TIMING', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0, intValue: -1 },
      ];
      
      const summary = getTimingSatisfactionSummary(assignments, preferences, storeConfig, breakRoleIds);
      
      expect(summary.totalPreferences).toBe(3);
      expect(summary.crewWithBreaks).toBe(2);
      expect(summary.crewWithoutBreaks).toBe(1);
      expect(summary.crewDetails).toHaveLength(3);
      expect(summary.crewDetails[0].hasBreak).toBe(true);
      expect(summary.crewDetails[0].preferredTiming).toBe('early');
      expect(summary.crewDetails[2].hasBreak).toBe(false);
    });

    it('should handle empty preferences', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const summary = getTimingSatisfactionSummary(assignments, preferences, storeConfig, breakRoleIds);
      
      expect(summary.totalPreferences).toBe(0);
      expect(summary.crewWithBreaks).toBe(0);
      expect(summary.crewWithoutBreaks).toBe(0);
      expect(summary.totalScore).toBe(0);
    });
  });

  describe('getOptimalBreakPosition', () => {
    it('should return earliest for early preference', () => {
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: -1
      };
      
      const optimal = getOptimalBreakPosition('CREW001', 480, preference, storeConfig);
      
      expect(optimal).toBe(660); // 480 + 180
    });

    it('should return latest for late preference', () => {
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: 1
      };
      
      const optimal = getOptimalBreakPosition('CREW001', 480, preference, storeConfig);
      
      expect(optimal).toBe(750); // 480 + 270
    });

    it('should return middle for no preference', () => {
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: 0
      };
      
      const optimal = getOptimalBreakPosition('CREW001', 480, preference, storeConfig);
      
      expect(optimal).toBe(705); // 480 + (180 + 270) / 2
    });
  });

  describe('wouldSatisfyTiming', () => {
    it('should return true for early break with early preference', () => {
      const breakAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 99,
        startMinutes: 660, // Earliest
        endMinutes: 690
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: -1
      };
      
      const result = wouldSatisfyTiming(breakAssignment, preference, 480, storeConfig);
      
      expect(result).toBe(true); // 100% satisfaction > 50%
    });

    it('should return true for late break with late preference', () => {
      const breakAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 99,
        startMinutes: 750, // Latest
        endMinutes: 780
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: 1
      };
      
      const result = wouldSatisfyTiming(breakAssignment, preference, 480, storeConfig);
      
      expect(result).toBe(true);
    });

    it('should return false for late break with early preference', () => {
      const breakAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 99,
        startMinutes: 750, // Latest
        endMinutes: 780
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: -1 // Wants early
      };
      
      const result = wouldSatisfyTiming(breakAssignment, preference, 480, storeConfig);
      
      expect(result).toBe(false); // 0% satisfaction < 50%
    });

    it('should return true for mid-window break (always >50% for one direction)', () => {
      const breakAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 99,
        startMinutes: 705, // Middle
        endMinutes: 735
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: -1
      };
      
      const result = wouldSatisfyTiming(breakAssignment, preference, 480, storeConfig);
      
      expect(result).toBe(false); // 50% satisfaction is not > 50%
    });

    it('should return true when no preference (intValue = 0)', () => {
      const breakAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 99,
        startMinutes: 750,
        endMinutes: 780
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: 0
      };
      
      const result = wouldSatisfyTiming(breakAssignment, preference, 480, storeConfig);
      
      expect(result).toBe(true); // No preference = always satisfied
    });
  });
});
