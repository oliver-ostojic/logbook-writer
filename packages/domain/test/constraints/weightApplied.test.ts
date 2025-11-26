/**
 * Tests for PreferenceSatisfaction.weightApplied calculation
 * 
 * Verifies that weightApplied = baseWeight * crewWeight * adaptiveBoost
 * across all preference types and satisfaction outcomes
 * 
 * Note: The scorers apply this formula to calculate final scores.
 * These tests verify the formula is correctly applied by checking
 * that scores match the expected calculation.
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreFirstHourPreferences,
  scoreCrewFirstHour,
  scoreFavoritePreferences,
  scoreCrewFavorite,
  scoreTimingPreferences,
  scoreCrewTiming,
  scoreConsecutivePreferences,
  scoreCrewConsecutive
} from '../../src/constraints';
import type { SolverAssignment, PreferenceConfig, StoreConfig } from '../../src/constraints/types';

describe('PreferenceSatisfaction.weightApplied Calculation', () => {
  const storeConfig: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,
    closeMinutesFromMidnight: 1260,
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270
  };

  const breakRoleIds = [99];

  /**
   * Helper to calculate expected weightApplied
   */
  function calculateWeightApplied(baseWeight: number, crewWeight: number, adaptiveBoost: number): number {
    return baseWeight * crewWeight * adaptiveBoost;
  }

  describe('FIRST_HOUR weightApplied formula', () => {
    it('should apply formula: score = baseWeight * crewWeight * adaptiveBoost when satisfied', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 3,
        adaptiveBoost: 2.0
      };

      const result = scoreCrewFirstHour(preference, assignments);

      const expectedWeight = calculateWeightApplied(5, 3, 2.0);
      expect(expectedWeight).toBe(30);
      
      expect(result.satisfied).toBe(true);
      expect(result.score).toBe(expectedWeight);
      expect(result.score).toBe(30);
    });

    it('should apply formula with different weight values', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const testCases = [
        { baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0, expected: 1 },
        { baseWeight: 2, crewWeight: 5, adaptiveBoost: 1.0, expected: 10 },
        { baseWeight: 10, crewWeight: 2, adaptiveBoost: 3.0, expected: 60 },
        { baseWeight: 2.5, crewWeight: 4, adaptiveBoost: 1.2, expected: 12 },
      ];

      for (const testCase of testCases) {
        const preference: PreferenceConfig = {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: testCase.baseWeight,
          crewWeight: testCase.crewWeight,
          adaptiveBoost: testCase.adaptiveBoost
        };

        const result = scoreCrewFirstHour(preference, assignments);
        
        expect(result.satisfied).toBe(true);
        expect(result.score).toBe(testCase.expected);
      }
    });

    it('should return 0 score when unsatisfied (formula not applied to score)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 }, // Wrong role
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 8,
        crewWeight: 4,
        adaptiveBoost: 1.5
      };

      const result = scoreCrewFirstHour(preference, assignments);
      
      // Weight would be 48, but preference not satisfied
      expect(result.satisfied).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should handle fractional weightApplied values', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 2.5,
        crewWeight: 1.2,
        adaptiveBoost: 1.5
      };

      const result = scoreCrewFirstHour(preference, assignments);
      
      const expectedWeight = 2.5 * 1.2 * 1.5; // 4.5
      expect(result.score).toBe(expectedWeight);
      expect(result.score).toBe(4.5);
    });
  });

  describe('FAVORITE weightApplied formula', () => {
    it('should apply formula: score = minutes * baseWeight * crewWeight * adaptiveBoost', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // 60 min
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 4,
        crewWeight: 2,
        adaptiveBoost: 3.0
      };

      const result = scoreCrewFavorite(preference, assignments);
      
      const weightApplied = calculateWeightApplied(4, 2, 3.0); // 24
      const expectedScore = 60 * weightApplied; // 60 * 24 = 1440
      
      expect(result.minutesOnFavorite).toBe(60);
      expect(result.score).toBe(expectedScore);
      expect(result.score).toBe(1440);
    });

    it('should scale score with minutes while weightApplied remains constant', () => {
      const testCases = [
        { minutes: 30, expected: 450 },   // 30 * (5 * 3 * 1.0) = 30 * 15
        { minutes: 60, expected: 900 },   // 60 * 15
        { minutes: 120, expected: 1800 }, // 120 * 15
        { minutes: 180, expected: 2700 }, // 180 * 15
      ];

      const baseWeight = 5;
      const crewWeight = 3;
      const adaptiveBoost = 1.0;
      const weightApplied = baseWeight * crewWeight * adaptiveBoost; // 15

      for (const testCase of testCases) {
        const assignments: SolverAssignment[] = [
          { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 480 + testCase.minutes },
        ];

        const preference: PreferenceConfig = {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight,
          crewWeight,
          adaptiveBoost
        };

        const result = scoreCrewFavorite(preference, assignments);
        
        expect(result.score).toBe(testCase.expected);
        expect(result.score).toBe(testCase.minutes * weightApplied);
      }
    });

    it('should return 0 when no time on favorite role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 10,
        crewWeight: 5,
        adaptiveBoost: 2.0
      };

      const result = scoreCrewFavorite(preference, assignments);
      
      // weightApplied would be 100, but 0 minutes on favorite
      expect(result.minutesOnFavorite).toBe(0);
      expect(result.score).toBe(0);
    });
  });

  describe('TIMING weightApplied formula', () => {
    it('should apply formula: score = satisfactionRate * baseWeight * crewWeight * adaptiveBoost', () => {
      // Early break when prefer early = 100% satisfaction
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 6,
        crewWeight: 4,
        adaptiveBoost: 1.5,
        intValue: -1 // Prefer early
      };

      const result = scoreCrewTiming(preference, assignments, storeConfig, breakRoleIds);
      
      const weightApplied = calculateWeightApplied(6, 4, 1.5); // 36
      const satisfactionRate = 1.0; // 100% satisfied (early break)
      const expectedScore = satisfactionRate * weightApplied; // 36
      
      expect(result.hasBreak).toBe(true);
      expect(result.score).toBe(expectedScore);
      expect(result.score).toBe(36);
    });

    it('should apply formula with partial satisfaction (mid-window break)', () => {
      // Mid-window break when prefer early = ~50% satisfaction
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 705 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 705, endMinutes: 735 }, // Mid-window
        { crewId: 'CREW001', roleId: 1, startMinutes: 735, endMinutes: 900 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 10,
        crewWeight: 2,
        adaptiveBoost: 2.0,
        intValue: -1
      };

      const result = scoreCrewTiming(preference, assignments, storeConfig, breakRoleIds);
      
      const weightApplied = calculateWeightApplied(10, 2, 2.0); // 40
      
      // Mid-window should be ~50% satisfaction
      expect(result.hasBreak).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(weightApplied);
      expect(result.score).toBeCloseTo(20, 0); // ~50% of 40
    });

    it('should return 0 when no break exists', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 8,
        crewWeight: 3,
        adaptiveBoost: 1.0,
        intValue: -1
      };

      const result = scoreCrewTiming(preference, assignments, storeConfig, breakRoleIds);
      
      expect(result.hasBreak).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('CONSECUTIVE weightApplied formula', () => {
    it('should apply formula: score = -switchCount * baseWeight * crewWeight * adaptiveBoost', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Switch 1
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 }, // Switch 2
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 7,
        crewWeight: 2,
        adaptiveBoost: 3.0
      };

      const result = scoreCrewConsecutive(preference, assignments, storeConfig);
      
      const weightApplied = calculateWeightApplied(7, 2, 3.0); // 42
      const switchCount = 2;
      const expectedScore = -switchCount * weightApplied; // -84
      
      expect(result.switches).toBe(2);
      expect(result.score).toBe(expectedScore);
      expect(result.score).toBe(-84);
    });

    it('should return 0 when no switches (satisfied preference)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 5,
        crewWeight: 4,
        adaptiveBoost: 2.0
      };

      const result = scoreCrewConsecutive(preference, assignments, storeConfig);
      
      // weightApplied would be 40, but no switches
      expect(result.switches).toBe(0);
      expect(result.score).toBe(0); // No penalty
    });

    it('should scale penalty with different switch counts', () => {
      const baseWeight = 10;
      const crewWeight = 1;
      const adaptiveBoost = 1.0;
      const weightApplied = baseWeight * crewWeight * adaptiveBoost; // 10

      const testCases = [
        { switches: 0, expectedScore: 0 },
        { switches: 1, expectedScore: -10 },
        { switches: 2, expectedScore: -20 },
        { switches: 5, expectedScore: -50 },
      ];

      for (const testCase of testCases) {
        // Create assignments with specified number of switches
        const assignments: SolverAssignment[] = [];
        for (let i = 0; i <= testCase.switches; i++) {
          assignments.push({
            crewId: 'CREW001',
            roleId: i % 2 === 0 ? 1 : 2, // Alternate roles to create switches
            startMinutes: 480 + (i * 60),
            endMinutes: 480 + ((i + 1) * 60)
          });
        }

        const preference: PreferenceConfig = {
          crewId: 'CREW001',
          roleId: null,
          preferenceType: 'CONSECUTIVE',
          baseWeight,
          crewWeight,
          adaptiveBoost
        };

        const result = scoreCrewConsecutive(preference, assignments, storeConfig);
        
        expect(result.score).toBe(testCase.expectedScore);
        if (testCase.switches > 0) {
          expect(result.score).toBe(-testCase.switches * weightApplied);
        }
      }
    });
  });

  describe('weightApplied with varying adaptiveBoost', () => {
    it('should scale all preference types proportionally with adaptiveBoost', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const boosts = [1.0, 1.5, 2.0, 3.0, 5.0];
      const baseWeight = 10;
      const crewWeight = 2;

      for (const boost of boosts) {
        const preference: PreferenceConfig = {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight,
          crewWeight,
          adaptiveBoost: boost
        };

        const result = scoreCrewFirstHour(preference, assignments);
        const expectedWeight = baseWeight * crewWeight * boost;
        
        expect(result.score).toBe(expectedWeight);
      }
    });

    it('should demonstrate fairness adjustment via adaptiveBoost', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW002', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      // CREW001 hasn't had preferences met recently (higher boost)
      const pref1: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 2.0 // Fairness boost
      };

      // CREW002 had preferences met recently (normal boost)
      const pref2: PreferenceConfig = {
        crewId: 'CREW002',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };

      const result1 = scoreCrewFirstHour(pref1, assignments);
      const result2 = scoreCrewFirstHour(pref2, assignments);
      
      expect(result1.score).toBe(10); // 5 * 1 * 2.0
      expect(result2.score).toBe(5);  // 5 * 1 * 1.0
      
      // CREW001 gets higher priority via adaptiveBoost
      expect(result1.score).toBeGreaterThan(result2.score);
    });
  });

  describe('weightApplied edge cases', () => {
    it('should handle weightApplied = 0 when baseWeight = 0', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 0,
        crewWeight: 100,
        adaptiveBoost: 100.0
      };

      const result = scoreCrewFirstHour(preference, assignments);
      
      expect(result.score).toBe(0);
    });

    it('should handle weightApplied = 0 when crewWeight = 0', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 100,
        crewWeight: 0,
        adaptiveBoost: 100.0
      };

      const result = scoreCrewFirstHour(preference, assignments);
      
      expect(result.score).toBe(0);
    });

    it('should handle very large weightApplied values', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1000,
        crewWeight: 100,
        adaptiveBoost: 10.0
      };

      const result = scoreCrewFirstHour(preference, assignments);
      
      const expectedWeight = 1000 * 100 * 10.0; // 1,000,000
      expect(result.score).toBe(expectedWeight);
      expect(result.score).toBe(1000000);
    });

    it('should preserve precision with fractional components', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 2.5,
        crewWeight: 1.2,
        adaptiveBoost: 1.5
      };

      const result = scoreCrewFirstHour(preference, assignments);
      
      const expectedWeight = 2.5 * 1.2 * 1.5; // 4.5
      expect(result.score).toBe(expectedWeight);
      expect(result.score).toBe(4.5);
    });
  });

  describe('Cross-preference formula consistency', () => {
    it('should apply weightApplied formula consistently across preference types', () => {
      const baseWeight = 5;
      const crewWeight = 3;
      const adaptiveBoost = 2.0;
      const expectedWeight = baseWeight * crewWeight * adaptiveBoost; // 30

      // FIRST_HOUR: direct application
      const firstHourAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      const firstHourPref: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight,
        crewWeight,
        adaptiveBoost
      };
      const firstHourResult = scoreCrewFirstHour(firstHourPref, firstHourAssignments);
      expect(firstHourResult.score).toBe(expectedWeight);

      // FAVORITE: per-minute application
      const favoritePref: PreferenceConfig = {
        ...firstHourPref,
        preferenceType: 'FAVORITE'
      };
      const favoriteResult = scoreCrewFavorite(favoritePref, firstHourAssignments);
      expect(favoriteResult.score).toBe(60 * expectedWeight); // 60 min * 30

      // TIMING: satisfaction-rate application (100% for early break)
      const timingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 },
      ];
      const timingPref: PreferenceConfig = {
        ...firstHourPref,
        roleId: null,
        preferenceType: 'TIMING',
        intValue: -1
      };
      const timingResult = scoreCrewTiming(timingPref, timingAssignments, storeConfig, breakRoleIds);
      expect(timingResult.score).toBe(expectedWeight); // 100% * 30

      // CONSECUTIVE: no switches = 0 penalty
      const consecutiveAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
      ];
      const consecutivePref: PreferenceConfig = {
        ...firstHourPref,
        roleId: null,
        preferenceType: 'CONSECUTIVE'
      };
      const consecutiveResult = scoreCrewConsecutive(consecutivePref, consecutiveAssignments, storeConfig);
      expect(consecutiveResult.score).toBe(0); // No switches

      // All use same weightApplied in their calculations
    });
  });
});
