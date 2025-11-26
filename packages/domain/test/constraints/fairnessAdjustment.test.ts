/**
 * Tests for PreferenceSatisfaction.fairnessAdjustment
 * 
 * fairnessAdjustment is a metric that tracks the fairness-based modifications
 * applied to preference scoring. It works in conjunction with adaptiveBoost to
 * ensure equitable distribution of preference satisfaction across crew members.
 * 
 * Key concepts:
 * - fairnessAdjustment tracks how much boost was applied due to fairness
 * - Positive values indicate crew received fairness priority
 * - Can be used to audit fairness decisions
 * - Helps balance satisfaction across crew over time
 * 
 * Note: Since fairnessAdjustment is currently a database field and not yet
 * implemented in the scoring functions, these tests demonstrate the expected
 * behavior and calculations for when it's integrated.
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreFirstHourPreferences,
  scoreCrewFirstHour,
  scoreFavoritePreferences,
  scoreCrewFavorite
} from '../../src/constraints';
import type { SolverAssignment, PreferenceConfig } from '../../src/constraints/types';

describe('PreferenceSatisfaction.fairnessAdjustment', () => {
  describe('fairnessAdjustment calculation concept', () => {
    it('should calculate fairnessAdjustment as (adaptiveBoost - 1.0)', () => {
      // fairnessAdjustment = adaptiveBoost - 1.0
      // This represents how much extra weight was added due to fairness
      
      const testCases = [
        { adaptiveBoost: 1.0, expectedAdjustment: 0.0 },   // No fairness boost
        { adaptiveBoost: 1.5, expectedAdjustment: 0.5 },   // 50% fairness boost
        { adaptiveBoost: 2.0, expectedAdjustment: 1.0 },   // 100% fairness boost
        { adaptiveBoost: 3.0, expectedAdjustment: 2.0 },   // 200% fairness boost
        { adaptiveBoost: 1.25, expectedAdjustment: 0.25 }, // 25% fairness boost
      ];

      for (const testCase of testCases) {
        const fairnessAdjustment = testCase.adaptiveBoost - 1.0;
        expect(fairnessAdjustment).toBe(testCase.expectedAdjustment);
      }
    });

    it('should show zero adjustment when no fairness boost applied', () => {
      // When adaptiveBoost = 1.0, no fairness adjustment was needed
      const adaptiveBoost = 1.0;
      const fairnessAdjustment = adaptiveBoost - 1.0;
      
      expect(fairnessAdjustment).toBe(0);
    });

    it('should show positive adjustment when fairness boost applied', () => {
      // When adaptiveBoost > 1.0, crew received fairness priority
      const adaptiveBoost = 2.5;
      const fairnessAdjustment = adaptiveBoost - 1.0;
      
      expect(fairnessAdjustment).toBe(1.5);
      expect(fairnessAdjustment).toBeGreaterThan(0);
    });
  });

  describe('fairnessAdjustment impact on scoring', () => {
    it('should demonstrate how fairnessAdjustment affects final score', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const baseWeight = 10;
      const crewWeight = 1;

      // No fairness boost
      const noBoostPref: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight,
        crewWeight,
        adaptiveBoost: 1.0
      };

      // With fairness boost
      const withBoostPref: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight,
        crewWeight,
        adaptiveBoost: 2.0 // 1.0 fairness adjustment
      };

      const noBoostResult = scoreCrewFirstHour(noBoostPref, assignments);
      const withBoostResult = scoreCrewFirstHour(withBoostPref, assignments);

      const fairnessAdjustment = withBoostPref.adaptiveBoost - 1.0;
      const extraScore = baseWeight * crewWeight * fairnessAdjustment;

      expect(noBoostResult.score).toBe(10);  // 10 * 1 * 1.0
      expect(withBoostResult.score).toBe(20); // 10 * 1 * 2.0
      expect(extraScore).toBe(10); // The extra 10 points from fairness
      expect(withBoostResult.score - noBoostResult.score).toBe(extraScore);
    });

    it('should calculate additive score contribution from fairness', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 600 }, // 120 min
      ];

      const baseWeight = 5;
      const crewWeight = 2;
      const adaptiveBoost = 3.0;
      const fairnessAdjustment = adaptiveBoost - 1.0; // 2.0

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight,
        crewWeight,
        adaptiveBoost
      };

      const result = scoreCrewFavorite(preference, assignments);

      // Base score (no fairness): 120 * 5 * 2 * 1.0 = 1200
      // With fairness: 120 * 5 * 2 * 3.0 = 3600
      // Fairness contribution: 120 * 5 * 2 * 2.0 = 2400

      const baseScore = 120 * baseWeight * crewWeight * 1.0;
      const totalScore = 120 * baseWeight * crewWeight * adaptiveBoost;
      const fairnessContribution = 120 * baseWeight * crewWeight * fairnessAdjustment;

      expect(result.score).toBe(totalScore);
      expect(result.score).toBe(3600);
      expect(fairnessContribution).toBe(2400);
      expect(totalScore - baseScore).toBe(fairnessContribution);
    });
  });

  describe('fairnessAdjustment for audit and tracking', () => {
    it('should enable tracking of fairness interventions per crew', () => {
      // Simulate multiple crew with different fairness needs
      const crewFairnessProfile = [
        { crewId: 'CREW_A', adaptiveBoost: 1.0, needsFairness: false },
        { crewId: 'CREW_B', adaptiveBoost: 1.8, needsFairness: true },
        { crewId: 'CREW_C', adaptiveBoost: 3.5, needsFairness: true },
        { crewId: 'CREW_D', adaptiveBoost: 1.2, needsFairness: false },
      ];

      const fairnessAdjustments = crewFairnessProfile.map(profile => ({
        crewId: profile.crewId,
        adjustment: profile.adaptiveBoost - 1.0,
        needsFairness: profile.needsFairness
      }));

      expect(fairnessAdjustments[0].adjustment).toBe(0.0);
      expect(fairnessAdjustments[1].adjustment).toBeCloseTo(0.8, 10);
      expect(fairnessAdjustments[2].adjustment).toBe(2.5);
      expect(fairnessAdjustments[3].adjustment).toBeCloseTo(0.2, 10);

      // Crew with higher adjustments received more fairness priority
      const highFairnessAdjustments = fairnessAdjustments.filter(fa => fa.adjustment > 1.0);
      expect(highFairnessAdjustments).toHaveLength(1);
      expect(highFairnessAdjustments[0].crewId).toBe('CREW_C');
    });

    it('should identify crew who received fairness boosts', () => {
      const satisfactionRecords = [
        { crewId: 'CREW001', adaptiveBoost: 1.0, score: 10 },
        { crewId: 'CREW002', adaptiveBoost: 2.5, score: 25 },
        { crewId: 'CREW003', adaptiveBoost: 1.3, score: 13 },
        { crewId: 'CREW004', adaptiveBoost: 4.0, score: 40 },
      ];

      const withFairnessBoost = satisfactionRecords
        .map(record => ({
          ...record,
          fairnessAdjustment: record.adaptiveBoost - 1.0,
          receivedBoost: record.adaptiveBoost > 1.0
        }))
        .filter(record => record.receivedBoost);

      expect(withFairnessBoost).toHaveLength(3);
      expect(withFairnessBoost[0].fairnessAdjustment).toBe(1.5); // CREW002
      expect(withFairnessBoost[1].fairnessAdjustment).toBeCloseTo(0.3, 10); // CREW003
      expect(withFairnessBoost[2].fairnessAdjustment).toBe(3.0); // CREW004
    });

    it('should calculate total fairness contribution across all crew', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW002', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW003', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1,
          adaptiveBoost: 1.0 // No fairness boost
        },
        {
          crewId: 'CREW002',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1,
          adaptiveBoost: 2.0 // 1.0 fairness adjustment
        },
        {
          crewId: 'CREW003',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1,
          adaptiveBoost: 3.0 // 2.0 fairness adjustment
        },
      ];

      const result = scoreFirstHourPreferences(assignments, preferences, []);

      // Total fairness contribution
      const totalFairnessAdjustment = preferences.reduce(
        (sum, pref) => sum + (pref.adaptiveBoost - 1.0),
        0
      );

      expect(totalFairnessAdjustment).toBe(3.0); // 0 + 1.0 + 2.0

      // Total score: CREW001=10, CREW002=20, CREW003=30 = 60
      expect(result.score).toBe(60);

      // Base score without fairness: 10 + 10 + 10 = 30
      // Fairness contribution: 0 + 10 + 20 = 30
      const baseScore = 30;
      const fairnessContribution = result.score - baseScore;
      expect(fairnessContribution).toBe(30);
    });
  });

  describe('fairnessAdjustment distribution patterns', () => {
    it('should show graduated fairness adjustments based on need', () => {
      // Simulate different levels of fairness need
      const fairnessLevels = [
        { level: 'none', adaptiveBoost: 1.0, expectedAdjustment: 0.0 },
        { level: 'low', adaptiveBoost: 1.25, expectedAdjustment: 0.25 },
        { level: 'moderate', adaptiveBoost: 1.75, expectedAdjustment: 0.75 },
        { level: 'high', adaptiveBoost: 2.5, expectedAdjustment: 1.5 },
        { level: 'very high', adaptiveBoost: 4.0, expectedAdjustment: 3.0 },
      ];

      for (const level of fairnessLevels) {
        const adjustment = level.adaptiveBoost - 1.0;
        expect(adjustment).toBe(level.expectedAdjustment);
      }

      // Higher fairness need = higher adjustment
      expect(fairnessLevels[4].expectedAdjustment).toBeGreaterThan(
        fairnessLevels[3].expectedAdjustment
      );
      expect(fairnessLevels[3].expectedAdjustment).toBeGreaterThan(
        fairnessLevels[2].expectedAdjustment
      );
    });

    it('should demonstrate fairness adjustment decay as crew get satisfied', () => {
      // Simulate multiple rounds where fairness adjustment decreases as crew gets satisfied
      const rounds = [
        { round: 1, adaptiveBoost: 3.0, fairnessAdjustment: 2.0, description: 'Very unsatisfied' },
        { round: 2, adaptiveBoost: 2.0, fairnessAdjustment: 1.0, description: 'Got some satisfaction' },
        { round: 3, adaptiveBoost: 1.5, fairnessAdjustment: 0.5, description: 'Mostly satisfied' },
        { round: 4, adaptiveBoost: 1.0, fairnessAdjustment: 0.0, description: 'Fully satisfied' },
      ];

      for (let i = 0; i < rounds.length - 1; i++) {
        const current = rounds[i];
        const next = rounds[i + 1];
        
        expect(current.fairnessAdjustment).toBeGreaterThan(next.fairnessAdjustment);
      }

      // Final round should have zero adjustment
      expect(rounds[rounds.length - 1].fairnessAdjustment).toBe(0);
    });
  });

  describe('fairnessAdjustment relative to total score', () => {
    it('should calculate fairness percentage of total score', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const baseWeight = 10;
      const crewWeight = 2;
      const adaptiveBoost = 3.0;
      const fairnessAdjustment = adaptiveBoost - 1.0; // 2.0

      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight,
        crewWeight,
        adaptiveBoost
      };

      const result = scoreCrewFirstHour(preference, assignments);

      const totalScore = result.score; // 60
      const baseScore = baseWeight * crewWeight * 1.0; // 20
      const fairnessContribution = baseWeight * crewWeight * fairnessAdjustment; // 40

      const fairnessPercentage = (fairnessContribution / totalScore) * 100;

      expect(totalScore).toBe(60);
      expect(fairnessContribution).toBe(40);
      expect(fairnessPercentage).toBeCloseTo(66.67, 1); // ~66.67% of score from fairness
    });

    it('should show fairness dominance in high-boost scenarios', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const testCases = [
        { adaptiveBoost: 1.0, expectedFairnessRatio: 0.0 },   // 0% from fairness
        { adaptiveBoost: 2.0, expectedFairnessRatio: 0.5 },   // 50% from fairness
        { adaptiveBoost: 3.0, expectedFairnessRatio: 0.667 }, // ~66.7% from fairness
        { adaptiveBoost: 5.0, expectedFairnessRatio: 0.8 },   // 80% from fairness
        { adaptiveBoost: 10.0, expectedFairnessRatio: 0.9 },  // 90% from fairness
      ];

      const baseWeight = 10;
      const crewWeight = 1;

      for (const testCase of testCases) {
        const preference: PreferenceConfig = {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight,
          crewWeight,
          adaptiveBoost: testCase.adaptiveBoost
        };

        const result = scoreCrewFirstHour(preference, assignments);
        
        const fairnessAdjustment = testCase.adaptiveBoost - 1.0;
        const fairnessContribution = baseWeight * crewWeight * fairnessAdjustment;
        const fairnessRatio = fairnessContribution / result.score;

        expect(fairnessRatio).toBeCloseTo(testCase.expectedFairnessRatio, 2);
      }
    });
  });

  describe('fairnessAdjustment comparison across crew', () => {
    it('should identify which crew received most fairness support', () => {
      const crewProfiles = [
        { crewId: 'CREW_A', name: 'Alice', adaptiveBoost: 1.0 },
        { crewId: 'CREW_B', name: 'Bob', adaptiveBoost: 2.5 },
        { crewId: 'CREW_C', name: 'Charlie', adaptiveBoost: 1.3 },
        { crewId: 'CREW_D', name: 'Diana', adaptiveBoost: 4.0 },
        { crewId: 'CREW_E', name: 'Eve', adaptiveBoost: 1.8 },
      ];

      const fairnessRankings = crewProfiles
        .map(profile => ({
          ...profile,
          fairnessAdjustment: profile.adaptiveBoost - 1.0
        }))
        .sort((a, b) => b.fairnessAdjustment - a.fairnessAdjustment);

      expect(fairnessRankings[0].crewId).toBe('CREW_D'); // Highest adjustment (3.0)
      expect(fairnessRankings[1].crewId).toBe('CREW_B'); // Second highest (1.5)
      expect(fairnessRankings[4].crewId).toBe('CREW_A'); // Lowest (0.0)

      expect(fairnessRankings[0].fairnessAdjustment).toBe(3.0);
      expect(fairnessRankings[fairnessRankings.length - 1].fairnessAdjustment).toBe(0.0);
    });

    it('should detect fairness imbalance across crew', () => {
      const crewAdjustments = [0.0, 0.2, 0.3, 3.5, 4.0]; // Most crew low, few very high

      const mean = crewAdjustments.reduce((a, b) => a + b, 0) / crewAdjustments.length;
      const variance = crewAdjustments.reduce((sum, adj) => sum + Math.pow(adj - mean, 2), 0) / crewAdjustments.length;
      const stdDev = Math.sqrt(variance);

      expect(mean).toBeCloseTo(1.6, 1);
      expect(stdDev).toBeGreaterThan(1.5); // High variance indicates imbalance

      // Identify outliers (more than 1 std dev from mean)
      const outliers = crewAdjustments.filter(adj => Math.abs(adj - mean) > stdDev);
      expect(outliers).toHaveLength(2); // 3.5 and 4.0 are outliers
    });
  });

  describe('fairnessAdjustment validation', () => {
    it('should always be non-negative (adaptiveBoost >= 1.0)', () => {
      const validBoosts = [1.0, 1.5, 2.0, 3.5, 10.0];

      for (const boost of validBoosts) {
        const fairnessAdjustment = boost - 1.0;
        expect(fairnessAdjustment).toBeGreaterThanOrEqual(0);
      }
    });

    it('should equal zero when no fairness boost applied', () => {
      const adaptiveBoost = 1.0;
      const fairnessAdjustment = adaptiveBoost - 1.0;

      expect(fairnessAdjustment).toBe(0);
    });

    it('should scale linearly with adaptiveBoost', () => {
      const boosts = [1.0, 2.0, 3.0, 4.0, 5.0];
      const adjustments = boosts.map(boost => boost - 1.0);

      expect(adjustments).toEqual([0.0, 1.0, 2.0, 3.0, 4.0]);

      // Each increment of 1.0 in boost adds 1.0 to adjustment
      for (let i = 1; i < adjustments.length; i++) {
        expect(adjustments[i] - adjustments[i - 1]).toBe(1.0);
      }
    });
  });
});
