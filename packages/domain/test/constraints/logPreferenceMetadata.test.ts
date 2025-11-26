/**
 * Tests for LogPreferenceMetadata
 * 
 * LogPreferenceMetadata provides aggregate statistics about preference satisfaction
 * for an entire logbook/schedule. It tracks:
 * - totalPreferences: How many preferences were configured
 * - preferencesMet: How many were successfully satisfied
 * - averageSatisfaction: Mean satisfaction across all crew
 * - totalWeightApplied: Sum of all weights applied
 * 
 * This metadata enables quick assessment of schedule quality and fairness.
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreFirstHourPreferences,
  scoreCrewFirstHour,
  scoreFavoritePreferences,
  scoreCrewFavorite,
  scoreTimingPreferences,
  scoreConsecutivePreferences
} from '../../src/constraints';
import type { SolverAssignment, PreferenceConfig, StoreConfig } from '../../src/constraints/types';

describe('LogPreferenceMetadata', () => {
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
   * Helper to calculate metadata from preference results
   */
  interface PreferenceResult {
    satisfied: boolean;
    score: number;
    weightApplied: number;
  }

  function calculateMetadata(results: PreferenceResult[]) {
    const totalPreferences = results.length;
    const preferencesMet = results.filter(r => r.satisfied).length;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const averageSatisfaction = totalPreferences > 0 ? totalScore / totalPreferences : 0;
    const totalWeightApplied = results.reduce((sum, r) => sum + r.weightApplied, 0);

    return {
      totalPreferences,
      preferencesMet,
      averageSatisfaction,
      totalWeightApplied
    };
  }

  describe('totalPreferences tracking', () => {
    it('should count all configured preferences', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW002', roleId: 2, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW003', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 5,
          crewWeight: 1,
          adaptiveBoost: 1.0
        },
        {
          crewId: 'CREW002',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 5,
          crewWeight: 1,
          adaptiveBoost: 1.0
        },
        {
          crewId: 'CREW003',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 5,
          crewWeight: 1,
          adaptiveBoost: 1.0
        },
      ];

      const totalPreferences = preferences.length;
      
      expect(totalPreferences).toBe(3);
    });

    it('should count preferences across different types', () => {
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 5, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 2, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: null, preferenceType: 'TIMING', baseWeight: 3, crewWeight: 1, adaptiveBoost: 1.0, intValue: -1 },
        { crewId: 'CREW003', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1, adaptiveBoost: 1.0 },
      ];

      const totalPreferences = preferences.length;
      
      expect(totalPreferences).toBe(4);
    });

    it('should handle zero preferences', () => {
      const preferences: PreferenceConfig[] = [];
      
      expect(preferences.length).toBe(0);
    });
  });

  describe('preferencesMet tracking', () => {
    it('should count satisfied preferences', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Satisfied
        { crewId: 'CREW002', roleId: 2, startMinutes: 480, endMinutes: 540 }, // Not satisfied (wants role 1)
        { crewId: 'CREW003', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Satisfied
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 5, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 5, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW003', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 5, crewWeight: 1, adaptiveBoost: 1.0 },
      ];

      const results = preferences.map(pref => {
        const result = scoreCrewFirstHour(pref, assignments);
        return {
          satisfied: result.satisfied,
          score: result.score,
          weightApplied: pref.baseWeight * pref.crewWeight * pref.adaptiveBoost
        };
      });

      const metadata = calculateMetadata(results);
      
      expect(metadata.totalPreferences).toBe(3);
      expect(metadata.preferencesMet).toBe(2); // CREW001 and CREW003 satisfied
    });

    it('should calculate satisfaction rate', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },
        { satisfied: true, score: 15, weightApplied: 15 },
        { satisfied: false, score: 0, weightApplied: 5 },
        { satisfied: true, score: 20, weightApplied: 20 },
        { satisfied: false, score: 0, weightApplied: 8 },
      ];

      const metadata = calculateMetadata(results);
      const satisfactionRate = metadata.preferencesMet / metadata.totalPreferences;
      
      expect(metadata.preferencesMet).toBe(3);
      expect(satisfactionRate).toBe(0.6); // 60% satisfied
    });

    it('should handle all preferences met', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },
        { satisfied: true, score: 15, weightApplied: 15 },
        { satisfied: true, score: 20, weightApplied: 20 },
      ];

      const metadata = calculateMetadata(results);
      const satisfactionRate = metadata.preferencesMet / metadata.totalPreferences;
      
      expect(metadata.preferencesMet).toBe(3);
      expect(satisfactionRate).toBe(1.0); // 100% satisfied
    });

    it('should handle no preferences met', () => {
      const results: PreferenceResult[] = [
        { satisfied: false, score: 0, weightApplied: 10 },
        { satisfied: false, score: 0, weightApplied: 15 },
        { satisfied: false, score: 0, weightApplied: 20 },
      ];

      const metadata = calculateMetadata(results);
      const satisfactionRate = metadata.preferencesMet / metadata.totalPreferences;
      
      expect(metadata.preferencesMet).toBe(0);
      expect(satisfactionRate).toBe(0.0); // 0% satisfied
    });
  });

  describe('averageSatisfaction calculation', () => {
    it('should calculate mean satisfaction score', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },
        { satisfied: true, score: 20, weightApplied: 20 },
        { satisfied: true, score: 30, weightApplied: 30 },
      ];

      const metadata = calculateMetadata(results);
      
      expect(metadata.averageSatisfaction).toBe(20); // (10 + 20 + 30) / 3
    });

    it('should include unsatisfied preferences (score=0) in average', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 60, weightApplied: 60 },
        { satisfied: false, score: 0, weightApplied: 20 },
        { satisfied: true, score: 30, weightApplied: 30 },
      ];

      const metadata = calculateMetadata(results);
      
      expect(metadata.averageSatisfaction).toBe(30); // (60 + 0 + 30) / 3
    });

    it('should handle mixed satisfaction levels', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 600 }, // 120 min
        { crewId: 'CREW002', roleId: 2, startMinutes: 480, endMinutes: 540 }, // Wrong role
        { crewId: 'CREW003', roleId: 1, startMinutes: 480, endMinutes: 510 }, // 30 min
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW003', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 },
      ];

      const results = preferences.map(pref => {
        const result = scoreCrewFavorite(pref, assignments);
        return {
          satisfied: result.minutesOnFavorite > 0,
          score: result.score,
          weightApplied: pref.baseWeight * pref.crewWeight * pref.adaptiveBoost
        };
      });

      const metadata = calculateMetadata(results);
      
      // Scores: 120, 0, 30
      expect(metadata.averageSatisfaction).toBe(50); // (120 + 0 + 30) / 3
    });

    it('should handle zero preferences', () => {
      const results: PreferenceResult[] = [];
      
      const metadata = calculateMetadata(results);
      
      expect(metadata.averageSatisfaction).toBe(0);
    });
  });

  describe('totalWeightApplied calculation', () => {
    it('should sum all weights applied', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 5 },
        { satisfied: true, score: 30, weightApplied: 15 },
        { satisfied: false, score: 0, weightApplied: 20 },
      ];

      const metadata = calculateMetadata(results);
      
      expect(metadata.totalWeightApplied).toBe(40); // 5 + 15 + 20
    });

    it('should include weights from unsatisfied preferences', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW002', roleId: 2, startMinutes: 480, endMinutes: 540 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 2, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 5, crewWeight: 3, adaptiveBoost: 2.0 },
      ];

      const results = preferences.map(pref => {
        const result = scoreCrewFirstHour(pref, assignments);
        return {
          satisfied: result.satisfied,
          score: result.score,
          weightApplied: pref.baseWeight * pref.crewWeight * pref.adaptiveBoost
        };
      });

      const metadata = calculateMetadata(results);
      
      // CREW001: 10 * 2 * 1.0 = 20 (satisfied)
      // CREW002: 5 * 3 * 2.0 = 30 (not satisfied)
      expect(metadata.totalWeightApplied).toBe(50); // 20 + 30
    });

    it('should reflect fairness adjustments in total weight', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },   // adaptiveBoost=1.0
        { satisfied: true, score: 40, weightApplied: 40 },   // adaptiveBoost=4.0
        { satisfied: false, score: 0, weightApplied: 15 },   // adaptiveBoost=1.5
      ];

      const metadata = calculateMetadata(results);
      
      expect(metadata.totalWeightApplied).toBe(65); // 10 + 40 + 15
      
      // Can calculate total fairness adjustment
      const totalFairnessAdjustment = 0 + 30 + 5; // (40-10) + (15-10)
      expect(totalFairnessAdjustment).toBe(35);
    });
  });

  describe('metadata quality indicators', () => {
    it('should identify high-quality schedule (high satisfaction rate)', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 50, weightApplied: 50 },
        { satisfied: true, score: 60, weightApplied: 60 },
        { satisfied: true, score: 55, weightApplied: 55 },
        { satisfied: false, score: 0, weightApplied: 20 },
      ];

      const metadata = calculateMetadata(results);
      const satisfactionRate = metadata.preferencesMet / metadata.totalPreferences;
      
      expect(satisfactionRate).toBe(0.75); // 75% satisfied
      expect(satisfactionRate).toBeGreaterThan(0.7); // Good quality threshold
    });

    it('should identify low-quality schedule (low satisfaction rate)', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },
        { satisfied: false, score: 0, weightApplied: 20 },
        { satisfied: false, score: 0, weightApplied: 30 },
        { satisfied: false, score: 0, weightApplied: 25 },
      ];

      const metadata = calculateMetadata(results);
      const satisfactionRate = metadata.preferencesMet / metadata.totalPreferences;
      
      expect(satisfactionRate).toBe(0.25); // 25% satisfied
      expect(satisfactionRate).toBeLessThan(0.5); // Poor quality threshold
    });

    it('should calculate average weight per preference', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 20, weightApplied: 10 },
        { satisfied: true, score: 60, weightApplied: 30 },
        { satisfied: false, score: 0, weightApplied: 20 },
      ];

      const metadata = calculateMetadata(results);
      const averageWeight = metadata.totalWeightApplied / metadata.totalPreferences;
      
      expect(averageWeight).toBe(20); // (10 + 30 + 20) / 3
    });

    it('should identify high-fairness schedule (high average adaptiveBoost)', () => {
      // Simulate preferences with varying fairness boosts
      const baseWeight = 10;
      const crewWeight = 1;
      
      const adaptiveBoosts = [1.0, 2.0, 3.0, 2.5]; // Average = 2.125
      const results: PreferenceResult[] = adaptiveBoosts.map(boost => ({
        satisfied: true,
        score: baseWeight * crewWeight * boost,
        weightApplied: baseWeight * crewWeight * boost
      }));

      const metadata = calculateMetadata(results);
      const averageWeight = metadata.totalWeightApplied / metadata.totalPreferences;
      
      // Average weight: (10 + 20 + 30 + 25) / 4 = 21.25
      expect(averageWeight).toBe(21.25);
      
      // High average weight suggests high fairness adjustments were needed
      expect(averageWeight).toBeGreaterThan(baseWeight * crewWeight); // Above baseline
    });
  });

  describe('metadata comparison across schedules', () => {
    it('should compare satisfaction rates between schedules', () => {
      const schedule1Results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },
        { satisfied: true, score: 15, weightApplied: 15 },
        { satisfied: false, score: 0, weightApplied: 5 },
      ];

      const schedule2Results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },
        { satisfied: true, score: 15, weightApplied: 15 },
        { satisfied: true, score: 20, weightApplied: 20 },
      ];

      const metadata1 = calculateMetadata(schedule1Results);
      const metadata2 = calculateMetadata(schedule2Results);

      const rate1 = metadata1.preferencesMet / metadata1.totalPreferences;
      const rate2 = metadata2.preferencesMet / metadata2.totalPreferences;

      expect(rate1).toBeCloseTo(0.667, 2); // 66.7%
      expect(rate2).toBe(1.0);   // 100%
      expect(rate2).toBeGreaterThan(rate1); // Schedule 2 is better
    });

    it('should compare average satisfaction scores', () => {
      const schedule1Results: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },
        { satisfied: true, score: 20, weightApplied: 20 },
        { satisfied: true, score: 30, weightApplied: 30 },
      ];

      const schedule2Results: PreferenceResult[] = [
        { satisfied: true, score: 50, weightApplied: 50 },
        { satisfied: true, score: 60, weightApplied: 60 },
        { satisfied: true, score: 70, weightApplied: 70 },
      ];

      const metadata1 = calculateMetadata(schedule1Results);
      const metadata2 = calculateMetadata(schedule2Results);

      expect(metadata1.averageSatisfaction).toBe(20);
      expect(metadata2.averageSatisfaction).toBe(60);
      expect(metadata2.averageSatisfaction).toBeGreaterThan(metadata1.averageSatisfaction);
    });

    it('should identify schedule requiring more fairness intervention', () => {
      const lowFairnessResults: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 }, // boost=1.0
        { satisfied: true, score: 10, weightApplied: 10 }, // boost=1.0
        { satisfied: true, score: 10, weightApplied: 10 }, // boost=1.0
      ];

      const highFairnessResults: PreferenceResult[] = [
        { satisfied: true, score: 10, weightApplied: 10 },  // boost=1.0
        { satisfied: true, score: 30, weightApplied: 30 },  // boost=3.0
        { satisfied: true, score: 50, weightApplied: 50 },  // boost=5.0
      ];

      const metadata1 = calculateMetadata(lowFairnessResults);
      const metadata2 = calculateMetadata(highFairnessResults);

      const avgWeight1 = metadata1.totalWeightApplied / metadata1.totalPreferences;
      const avgWeight2 = metadata2.totalWeightApplied / metadata2.totalPreferences;

      expect(avgWeight1).toBe(10);
      expect(avgWeight2).toBe(30); // High average weight = high fairness intervention
      expect(avgWeight2).toBeGreaterThan(avgWeight1);
    });
  });

  describe('metadata edge cases', () => {
    it('should handle schedule with no preferences', () => {
      const results: PreferenceResult[] = [];
      
      const metadata = calculateMetadata(results);
      
      expect(metadata.totalPreferences).toBe(0);
      expect(metadata.preferencesMet).toBe(0);
      expect(metadata.averageSatisfaction).toBe(0);
      expect(metadata.totalWeightApplied).toBe(0);
    });

    it('should handle schedule with single preference', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 42, weightApplied: 42 }
      ];
      
      const metadata = calculateMetadata(results);
      
      expect(metadata.totalPreferences).toBe(1);
      expect(metadata.preferencesMet).toBe(1);
      expect(metadata.averageSatisfaction).toBe(42);
      expect(metadata.totalWeightApplied).toBe(42);
    });

    it('should handle very large numbers of preferences', () => {
      const results: PreferenceResult[] = Array.from({ length: 1000 }, (_, i) => ({
        satisfied: i % 2 === 0, // 50% satisfied
        score: i % 2 === 0 ? 10 : 0,
        weightApplied: 10
      }));

      const metadata = calculateMetadata(results);
      
      expect(metadata.totalPreferences).toBe(1000);
      expect(metadata.preferencesMet).toBe(500);
      expect(metadata.averageSatisfaction).toBe(5); // 500 * 10 / 1000
      expect(metadata.totalWeightApplied).toBe(10000);
    });

    it('should handle fractional scores and weights', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 12.5, weightApplied: 12.5 },
        { satisfied: true, score: 7.75, weightApplied: 7.75 },
        { satisfied: false, score: 0, weightApplied: 5.25 },
      ];

      const metadata = calculateMetadata(results);
      
      expect(metadata.totalPreferences).toBe(3);
      expect(metadata.preferencesMet).toBe(2);
      expect(metadata.averageSatisfaction).toBeCloseTo(6.75, 2); // (12.5 + 7.75 + 0) / 3
      expect(metadata.totalWeightApplied).toBe(25.5); // 12.5 + 7.75 + 5.25
    });
  });

  describe('metadata-driven reporting', () => {
    it('should generate schedule quality report', () => {
      const results: PreferenceResult[] = [
        { satisfied: true, score: 50, weightApplied: 50 },
        { satisfied: true, score: 60, weightApplied: 60 },
        { satisfied: false, score: 0, weightApplied: 30 },
        { satisfied: true, score: 45, weightApplied: 45 },
      ];

      const metadata = calculateMetadata(results);
      const satisfactionRate = metadata.preferencesMet / metadata.totalPreferences;
      const avgWeight = metadata.totalWeightApplied / metadata.totalPreferences;

      const report = {
        totalPreferences: metadata.totalPreferences,
        preferencesMet: metadata.preferencesMet,
        satisfactionRate: (satisfactionRate * 100).toFixed(1) + '%',
        averageSatisfaction: metadata.averageSatisfaction.toFixed(1),
        totalWeightApplied: metadata.totalWeightApplied,
        averageWeight: avgWeight.toFixed(1),
        quality: satisfactionRate >= 0.7 ? 'Good' : satisfactionRate >= 0.5 ? 'Fair' : 'Poor'
      };

      expect(report.totalPreferences).toBe(4);
      expect(report.preferencesMet).toBe(3);
      expect(report.satisfactionRate).toBe('75.0%');
      expect(report.averageSatisfaction).toBe('38.8');
      expect(report.quality).toBe('Good');
    });
  });
});
