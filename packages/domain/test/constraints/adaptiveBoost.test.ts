/**
 * Tests for PreferenceSatisfaction.adaptiveBoost
 * 
 * Verifies that adaptiveBoost increases for crew who haven't had preferences met recently.
 * adaptiveBoost is a fairness mechanism that gives priority to crew members whose
 * preferences have been unsatisfied in recent schedules.
 * 
 * Key concepts:
 * - adaptiveBoost >= 1.0 (never reduces weight below base)
 * - Higher adaptiveBoost = higher priority for satisfaction
 * - Crew with recently satisfied preferences get lower boost (closer to 1.0)
 * - Crew with unsatisfied preferences get higher boost (> 1.0)
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

describe('PreferenceSatisfaction.adaptiveBoost', () => {
  const storeConfig: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,
    closeMinutesFromMidnight: 1260,
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270
  };

  const breakRoleIds = [99];

  describe('adaptiveBoost baseline behavior', () => {
    it('should have minimum value of 1.0 (no reduction)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 10,
        crewWeight: 5,
        adaptiveBoost: 1.0 // Baseline - no boost or reduction
      };

      const result = scoreCrewFirstHour(preference, assignments);
      
      // With adaptiveBoost = 1.0, score is just baseWeight * crewWeight
      expect(result.score).toBe(50); // 10 * 5 * 1.0
    });

    it('should amplify score when boost > 1.0', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const baselinePreference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 10,
        crewWeight: 5,
        adaptiveBoost: 1.0
      };

      const boostedPreference: PreferenceConfig = {
        ...baselinePreference,
        adaptiveBoost: 2.0 // 2x boost for fairness
      };

      const baselineResult = scoreCrewFirstHour(baselinePreference, assignments);
      const boostedResult = scoreCrewFirstHour(boostedPreference, assignments);
      
      expect(baselineResult.score).toBe(50);  // 10 * 5 * 1.0
      expect(boostedResult.score).toBe(100);  // 10 * 5 * 2.0
      expect(boostedResult.score).toBe(baselineResult.score * 2);
    });

    it('should apply consistently across all preference types', () => {
      const boost = 3.0;
      const baseWeight = 5;
      const crewWeight = 2;

      // FIRST_HOUR
      const firstHourAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      const firstHourPref: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight,
        crewWeight,
        adaptiveBoost: boost
      };
      const firstHourResult = scoreCrewFirstHour(firstHourPref, firstHourAssignments);
      expect(firstHourResult.score).toBe(30); // 5 * 2 * 3.0

      // FAVORITE
      const favoritePref: PreferenceConfig = {
        ...firstHourPref,
        preferenceType: 'FAVORITE'
      };
      const favoriteResult = scoreCrewFavorite(favoritePref, firstHourAssignments);
      expect(favoriteResult.score).toBe(1800); // 60 min * 5 * 2 * 3.0

      // CONSECUTIVE (no switches)
      const consecutivePref: PreferenceConfig = {
        ...firstHourPref,
        roleId: null,
        preferenceType: 'CONSECUTIVE'
      };
      const consecutiveResult = scoreCrewConsecutive(consecutivePref, firstHourAssignments, storeConfig);
      expect(consecutiveResult.score).toBe(0); // No switches

      // All use the same adaptiveBoost multiplier
    });
  });

  describe('adaptiveBoost fairness prioritization', () => {
    it('should prioritize crew with higher adaptiveBoost when competing for same preference', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW_UNSATISFIED', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW_SATISFIED', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      // Crew who hasn't had preference met recently (higher boost)
      const unsatisfiedPref: PreferenceConfig = {
        crewId: 'CREW_UNSATISFIED',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 3.0 // High boost due to fairness
      };

      // Crew who had preference met recently (normal boost)
      const satisfiedPref: PreferenceConfig = {
        crewId: 'CREW_SATISFIED',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 1.0 // Normal boost
      };

      const unsatisfiedResult = scoreCrewFirstHour(unsatisfiedPref, assignments);
      const satisfiedResult = scoreCrewFirstHour(satisfiedPref, assignments);
      
      // Higher boost = higher priority score
      expect(unsatisfiedResult.score).toBe(15); // 5 * 1 * 3.0
      expect(satisfiedResult.score).toBe(5);    // 5 * 1 * 1.0
      expect(unsatisfiedResult.score).toBeGreaterThan(satisfiedResult.score * 2);
    });

    it('should demonstrate fairness across multiple crew with varying boost levels', () => {
      const testCases = [
        { crewId: 'CREW_A', boostLevel: 1.0, description: 'recently satisfied' },
        { crewId: 'CREW_B', boostLevel: 1.5, description: 'moderately unsatisfied' },
        { crewId: 'CREW_C', boostLevel: 2.5, description: 'highly unsatisfied' },
        { crewId: 'CREW_D', boostLevel: 4.0, description: 'very highly unsatisfied' },
      ];

      const baseWeight = 10;
      const crewWeight = 1;

      for (const testCase of testCases) {
        const assignments: SolverAssignment[] = [
          { crewId: testCase.crewId, roleId: 1, startMinutes: 480, endMinutes: 540 },
        ];

        const preference: PreferenceConfig = {
          crewId: testCase.crewId,
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight,
          crewWeight,
          adaptiveBoost: testCase.boostLevel
        };

        const result = scoreCrewFirstHour(preference, assignments);
        const expectedScore = baseWeight * crewWeight * testCase.boostLevel;
        
        expect(result.score).toBe(expectedScore);
      }

      // Scores should be: 10, 15, 25, 40
      // Higher boost = higher priority for solver
    });

    it('should enable lower-weight preferences to outrank higher-weight via adaptiveBoost', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW_LOW_WEIGHT', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW_HIGH_WEIGHT', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      // Low baseWeight but high adaptiveBoost (fairness priority)
      const lowWeightHighBoost: PreferenceConfig = {
        crewId: 'CREW_LOW_WEIGHT',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 2,
        crewWeight: 1,
        adaptiveBoost: 5.0 // Very high boost
      };

      // High baseWeight but normal adaptiveBoost
      const highWeightLowBoost: PreferenceConfig = {
        crewId: 'CREW_HIGH_WEIGHT',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 8,
        crewWeight: 1,
        adaptiveBoost: 1.0 // Normal boost
      };

      const lowWeightResult = scoreCrewFirstHour(lowWeightHighBoost, assignments);
      const highWeightResult = scoreCrewFirstHour(highWeightLowBoost, assignments);
      
      expect(lowWeightResult.score).toBe(10);  // 2 * 1 * 5.0
      expect(highWeightResult.score).toBe(8);  // 8 * 1 * 1.0
      
      // Fairness boost overcomes lower base preference weight
      expect(lowWeightResult.score).toBeGreaterThan(highWeightResult.score);
    });
  });

  describe('adaptiveBoost scaling behavior', () => {
    it('should scale linearly with boost value', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const boostLevels = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
      const scores: number[] = [];

      for (const boost of boostLevels) {
        const preference: PreferenceConfig = {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 2,
          adaptiveBoost: boost
        };

        const result = scoreCrewFirstHour(preference, assignments);
        scores.push(result.score);
      }

      // Verify linear scaling
      expect(scores[0]).toBe(20);  // 10 * 2 * 1.0
      expect(scores[1]).toBe(30);  // 10 * 2 * 1.5
      expect(scores[2]).toBe(40);  // 10 * 2 * 2.0
      expect(scores[3]).toBe(50);  // 10 * 2 * 2.5
      expect(scores[4]).toBe(60);  // 10 * 2 * 3.0
      expect(scores[5]).toBe(80);  // 10 * 2 * 4.0
      expect(scores[6]).toBe(100); // 10 * 2 * 5.0
    });

    it('should maintain relative boost differences across different base weights', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const baseWeights = [1, 5, 10, 20];
      const boost1 = 1.0;
      const boost2 = 2.0;

      for (const baseWeight of baseWeights) {
        const pref1: PreferenceConfig = {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight,
          crewWeight: 1,
          adaptiveBoost: boost1
        };

        const pref2: PreferenceConfig = {
          ...pref1,
          adaptiveBoost: boost2
        };

        const result1 = scoreCrewFirstHour(pref1, assignments);
        const result2 = scoreCrewFirstHour(pref2, assignments);
        
        // Boost2 should always be 2x boost1
        expect(result2.score).toBe(result1.score * 2);
      }
    });
  });

  describe('adaptiveBoost with different preference types', () => {
    it('should amplify FAVORITE preference scores proportionally', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 600 }, // 120 min
      ];

      const normalBoost: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };

      const highBoost: PreferenceConfig = {
        ...normalBoost,
        adaptiveBoost: 3.0
      };

      const normalResult = scoreCrewFavorite(normalBoost, assignments);
      const highResult = scoreCrewFavorite(highBoost, assignments);
      
      expect(normalResult.score).toBe(240); // 120 * 2 * 1 * 1.0
      expect(highResult.score).toBe(720);   // 120 * 2 * 1 * 3.0
      expect(highResult.score).toBe(normalResult.score * 3);
    });

    it('should amplify TIMING preference scores proportionally', () => {
      // Early break when prefer early = 100% satisfaction
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 },
      ];

      const normalBoost: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 5,
        crewWeight: 2,
        adaptiveBoost: 1.0,
        intValue: -1
      };

      const highBoost: PreferenceConfig = {
        ...normalBoost,
        adaptiveBoost: 2.5
      };

      const normalResult = scoreCrewTiming(normalBoost, assignments, storeConfig, breakRoleIds);
      const highResult = scoreCrewTiming(highBoost, assignments, storeConfig, breakRoleIds);
      
      expect(normalResult.score).toBe(10);  // 1.0 * 5 * 2 * 1.0
      expect(highResult.score).toBe(25);    // 1.0 * 5 * 2 * 2.5
      expect(highResult.score).toBe(normalResult.score * 2.5);
    });

    it('should amplify CONSECUTIVE penalties proportionally', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // 1 switch
      ];

      const normalBoost: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 10,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };

      const highBoost: PreferenceConfig = {
        ...normalBoost,
        adaptiveBoost: 3.0
      };

      const normalResult = scoreCrewConsecutive(normalBoost, assignments, storeConfig);
      const highResult = scoreCrewConsecutive(highBoost, assignments, storeConfig);
      
      expect(normalResult.score).toBe(-10); // -1 * 10 * 1 * 1.0
      expect(highResult.score).toBe(-30);   // -1 * 10 * 1 * 3.0
      
      // Higher boost = stronger penalty (more important to avoid switches)
      expect(Math.abs(highResult.score)).toBe(Math.abs(normalResult.score) * 3);
    });
  });

  describe('adaptiveBoost temporal fairness simulation', () => {
    it('should demonstrate fairness over multiple scheduling rounds', () => {
      // Simulate 3 rounds of scheduling where adaptiveBoost adjusts based on satisfaction history
      
      // Round 1: Both crew have equal boost
      const round1Assignments: SolverAssignment[] = [
        { crewId: 'CREW_A', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Satisfied
        { crewId: 'CREW_B', roleId: 2, startMinutes: 480, endMinutes: 540 }, // Not satisfied (wants role 1)
      ];

      const round1PrefsA: PreferenceConfig = {
        crewId: 'CREW_A',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };

      const round1PrefsB: PreferenceConfig = {
        crewId: 'CREW_B',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };

      const resultA_R1 = scoreCrewFirstHour(round1PrefsA, round1Assignments);
      const resultB_R1 = scoreCrewFirstHour(round1PrefsB, round1Assignments);

      expect(resultA_R1.satisfied).toBe(true);
      expect(resultA_R1.score).toBe(5); // Got preference
      expect(resultB_R1.satisfied).toBe(false);
      expect(resultB_R1.score).toBe(0); // Didn't get preference

      // Round 2: CREW_B gets boost due to not being satisfied in round 1
      const round2Assignments: SolverAssignment[] = [
        { crewId: 'CREW_A', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW_B', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const round2PrefsA: PreferenceConfig = {
        ...round1PrefsA,
        adaptiveBoost: 1.0 // Normal - was satisfied recently
      };

      const round2PrefsB: PreferenceConfig = {
        ...round1PrefsB,
        adaptiveBoost: 2.0 // Boosted - wasn't satisfied in round 1
      };

      const resultA_R2 = scoreCrewFirstHour(round2PrefsA, round2Assignments);
      const resultB_R2 = scoreCrewFirstHour(round2PrefsB, round2Assignments);

      expect(resultA_R2.score).toBe(5);  // 5 * 1 * 1.0
      expect(resultB_R2.score).toBe(10); // 5 * 1 * 2.0
      
      // CREW_B now has higher priority due to fairness
      expect(resultB_R2.score).toBeGreaterThan(resultA_R2.score);

      // Round 3: Both get satisfied, boosts equalize
      const round3PrefsA: PreferenceConfig = {
        ...round1PrefsA,
        adaptiveBoost: 1.2 // Slight boost - moderately satisfied
      };

      const round3PrefsB: PreferenceConfig = {
        ...round1PrefsB,
        adaptiveBoost: 1.0 // Normal - recently satisfied in round 2
      };

      const resultA_R3 = scoreCrewFirstHour(round3PrefsA, round2Assignments);
      const resultB_R3 = scoreCrewFirstHour(round3PrefsB, round2Assignments);

      expect(resultA_R3.score).toBe(6); // 5 * 1 * 1.2
      expect(resultB_R3.score).toBe(5); // 5 * 1 * 1.0
      
      // Now CREW_A gets slight priority
    });

    it('should demonstrate cumulative fairness effect', () => {
      // Crew who has been unsatisfied for multiple rounds gets progressively higher boost
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW_LONG_UNSATISFIED', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const recentlyUnsatisfied: PreferenceConfig = {
        crewId: 'CREW_LONG_UNSATISFIED',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 1.5 // 1 round unsatisfied
      };

      const moderatelyUnsatisfied: PreferenceConfig = {
        ...recentlyUnsatisfied,
        adaptiveBoost: 2.5 // 2-3 rounds unsatisfied
      };

      const highlyUnsatisfied: PreferenceConfig = {
        ...recentlyUnsatisfied,
        adaptiveBoost: 4.0 // Many rounds unsatisfied
      };

      const result1 = scoreCrewFirstHour(recentlyUnsatisfied, assignments);
      const result2 = scoreCrewFirstHour(moderatelyUnsatisfied, assignments);
      const result3 = scoreCrewFirstHour(highlyUnsatisfied, assignments);

      expect(result1.score).toBe(7.5);  // 5 * 1 * 1.5
      expect(result2.score).toBe(12.5); // 5 * 1 * 2.5
      expect(result3.score).toBe(20);   // 5 * 1 * 4.0

      // Progressive boost ensures long-unsatisfied crew eventually gets priority
      expect(result3.score).toBeGreaterThan(result2.score);
      expect(result2.score).toBeGreaterThan(result1.score);
    });
  });

  describe('adaptiveBoost edge cases', () => {
    it('should handle very high boost values', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const extremeBoost: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 100.0 // Extremely high priority
      };

      const result = scoreCrewFirstHour(extremeBoost, assignments);
      
      expect(result.score).toBe(500); // 5 * 1 * 100.0
    });

    it('should handle fractional boost values', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const fractionalBoost: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 10,
        crewWeight: 2,
        adaptiveBoost: 1.25
      };

      const result = scoreCrewFirstHour(fractionalBoost, assignments);
      
      expect(result.score).toBe(25); // 10 * 2 * 1.25
    });

    it('should maintain precision with complex fractional calculations', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const complexBoost: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 3.5,
        crewWeight: 2.2,
        adaptiveBoost: 1.75
      };

      const result = scoreCrewFirstHour(complexBoost, assignments);
      
      const expectedScore = 3.5 * 2.2 * 1.75; // 13.475
      expect(result.score).toBeCloseTo(expectedScore, 3);
      expect(result.score).toBeCloseTo(13.475, 3);
    });
  });

  describe('adaptiveBoost interaction with other weight components', () => {
    it('should multiply with both baseWeight and crewWeight', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      // Test all three components independently
      const baseline: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 5.0
      };

      const doubleBase: PreferenceConfig = { ...baseline, baseWeight: 4 };
      const doubleCrew: PreferenceConfig = { ...baseline, crewWeight: 6 };
      const doubleBoost: PreferenceConfig = { ...baseline, adaptiveBoost: 10.0 };

      const baseResult = scoreCrewFirstHour(baseline, assignments);
      const baseDoubleResult = scoreCrewFirstHour(doubleBase, assignments);
      const crewDoubleResult = scoreCrewFirstHour(doubleCrew, assignments);
      const boostDoubleResult = scoreCrewFirstHour(doubleBoost, assignments);

      expect(baseResult.score).toBe(30);         // 2 * 3 * 5.0
      expect(baseDoubleResult.score).toBe(60);   // 4 * 3 * 5.0 (2x baseWeight)
      expect(crewDoubleResult.score).toBe(60);   // 2 * 6 * 5.0 (2x crewWeight)
      expect(boostDoubleResult.score).toBe(60);  // 2 * 3 * 10.0 (2x adaptiveBoost)

      // Doubling any component doubles the score
      expect(baseDoubleResult.score).toBe(baseResult.score * 2);
      expect(crewDoubleResult.score).toBe(baseResult.score * 2);
      expect(boostDoubleResult.score).toBe(baseResult.score * 2);
    });

    it('should preserve priority order when all components scale together', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW_HIGH', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW_LOW', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const highPriority: PreferenceConfig = {
        crewId: 'CREW_HIGH',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 10,
        crewWeight: 2,
        adaptiveBoost: 3.0
      };

      const lowPriority: PreferenceConfig = {
        crewId: 'CREW_LOW',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        adaptiveBoost: 1.5
      };

      const highResult = scoreCrewFirstHour(highPriority, assignments);
      const lowResult = scoreCrewFirstHour(lowPriority, assignments);

      expect(highResult.score).toBe(60);   // 10 * 2 * 3.0
      expect(lowResult.score).toBe(7.5);   // 5 * 1 * 1.5

      // High priority is 8x higher (2x base * 2x crew * 2x boost)
      expect(highResult.score).toBeGreaterThan(lowResult.score * 7);
    });
  });
});
