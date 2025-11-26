/**
 * Tests for RolePreference.baseWeight
 * 
 * Verifies that baseWeight multiplier affects preference satisfaction scoring
 * across all preference types (FIRST_HOUR, FAVORITE, TIMING, CONSECUTIVE)
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreFirstHourPreferences,
  scoreFavoritePreferences,
  scoreTimingPreferences,
  scoreConsecutivePreferences
} from '../../src/constraints';
import type { SolverAssignment, PreferenceConfig, StoreConfig } from '../../src/constraints/types';

describe('RolePreference.baseWeight Impact', () => {
  const storeConfig: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,
    closeMinutesFromMidnight: 1260,
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270
  };

  const breakRoleIds = [99];

  describe('FIRST_HOUR preference baseWeight', () => {
    const assignments: SolverAssignment[] = [
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // First assignment matches preference
    ];

    it('should scale score linearly with baseWeight', () => {
      const weights = [1, 2, 5, 10];
      const scores: number[] = [];

      for (const baseWeight of weights) {
        const preferences: PreferenceConfig[] = [{
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight,
          crewWeight: 1,
          adaptiveBoost: 1.0
        }];

        const result = scoreFirstHourPreferences(assignments, preferences, []);
        scores.push(result.score);
      }

      // Scores should scale linearly: score = baseWeight * crewWeight * adaptiveBoost
      expect(scores[0]).toBe(1);  // 1 * 1 * 1 = 1
      expect(scores[1]).toBe(2);  // 2 * 1 * 1 = 2
      expect(scores[2]).toBe(5);  // 5 * 1 * 1 = 5
      expect(scores[3]).toBe(10); // 10 * 1 * 1 = 10
    });

    it('should maintain baseWeight ratio when crewWeight varies', () => {
      const baseWeight1 = 2;
      const baseWeight2 = 6; // 3x larger
      const crewWeight = 5;

      const prefs1: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: baseWeight1,
        crewWeight,
        adaptiveBoost: 1.0
      }];

      const prefs2: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: baseWeight2,
        crewWeight,
        adaptiveBoost: 1.0
      }];

      const score1 = scoreFirstHourPreferences(assignments, prefs1, []).score;
      const score2 = scoreFirstHourPreferences(assignments, prefs2, []).score;

      // score2 should be 3x score1
      expect(score2).toBe(score1 * 3);
      expect(score1).toBe(10); // 2 * 5 * 1
      expect(score2).toBe(30); // 6 * 5 * 1
    });

    it('should differentiate preference priority with different baseWeights', () => {
      const assignmentsCrew1: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      
      const assignmentsCrew2: SolverAssignment[] = [
        { crewId: 'CREW002', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      // CREW001 has high priority (baseWeight=10)
      const highPriority: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 10,
        crewWeight: 1,
        adaptiveBoost: 1.0
      }];

      // CREW002 has low priority (baseWeight=1)
      const lowPriority: PreferenceConfig[] = [{
        crewId: 'CREW002',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      }];

      const highScore = scoreFirstHourPreferences(assignmentsCrew1, highPriority, []).score;
      const lowScore = scoreFirstHourPreferences(assignmentsCrew2, lowPriority, []).score;

      expect(highScore).toBe(10);
      expect(lowScore).toBe(1);
      expect(highScore).toBeGreaterThan(lowScore * 5);
    });
  });

  describe('FAVORITE preference baseWeight', () => {
    const assignments: SolverAssignment[] = [
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // 60 min on role 1
      { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 }, // 60 min on role 1
    ];

    it('should scale score linearly with baseWeight', () => {
      const weights = [1, 2, 5, 10];
      const scores: number[] = [];

      for (const baseWeight of weights) {
        const preferences: PreferenceConfig[] = [{
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight,
          crewWeight: 1,
          adaptiveBoost: 1.0
        }];

        const result = scoreFavoritePreferences(assignments, preferences, []);
        scores.push(result.score);
      }

      // Scores should scale linearly: score = minutes * baseWeight * crewWeight * adaptiveBoost
      // 120 minutes on favorite role
      expect(scores[0]).toBe(120);  // 120 * 1 * 1 * 1 = 120
      expect(scores[1]).toBe(240);  // 120 * 2 * 1 * 1 = 240
      expect(scores[2]).toBe(600);  // 120 * 5 * 1 * 1 = 600
      expect(scores[3]).toBe(1200); // 120 * 10 * 1 * 1 = 1200
    });

    it('should maintain proportional impact across different durations', () => {
      const shortAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 510 }, // 30 min
      ];

      const longAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // 60 min
      ];

      const baseWeight = 5;
      const preferences: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight,
        crewWeight: 1,
        adaptiveBoost: 1.0
      }];

      const shortScore = scoreFavoritePreferences(shortAssignments, preferences, []).score;
      const longScore = scoreFavoritePreferences(longAssignments, preferences, []).score;

      expect(shortScore).toBe(150); // 30 * 5 * 1 * 1
      expect(longScore).toBe(300);  // 60 * 5 * 1 * 1
      expect(longScore).toBe(shortScore * 2); // Double duration = double score
    });
  });

  describe('TIMING preference baseWeight', () => {
    const assignments: SolverAssignment[] = [
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
      { crewId: 'CREW001', roleId: 99, startMinutes: 660, endMinutes: 690 }, // Early break (100% satisfaction)
      { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 900 },
    ];

    it('should scale score linearly with baseWeight', () => {
      const weights = [1, 2, 5, 10];
      const scores: number[] = [];

      for (const baseWeight of weights) {
        const preferences: PreferenceConfig[] = [{
          crewId: 'CREW001',
          roleId: null,
          preferenceType: 'TIMING',
          baseWeight,
          crewWeight: 1,
          adaptiveBoost: 1.0,
          intValue: -1 // Prefer early
        }];

        const result = scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds);
        scores.push(result.score);
      }

      // 100% satisfaction (early break when prefer early)
      expect(scores[0]).toBe(1);  // 1 * 1 * 1 * 1 = 1
      expect(scores[1]).toBe(2);  // 1 * 2 * 1 * 1 = 2
      expect(scores[2]).toBe(5);  // 1 * 5 * 1 * 1 = 5
      expect(scores[3]).toBe(10); // 1 * 10 * 1 * 1 = 10
    });

    it('should scale partial satisfaction proportionally', () => {
      // Mid-window break (50% satisfaction for early preference)
      const midBreakAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 705 },
        { crewId: 'CREW001', roleId: 99, startMinutes: 705, endMinutes: 735 }, // Mid-window
        { crewId: 'CREW001', roleId: 1, startMinutes: 735, endMinutes: 900 },
      ];

      const baseWeight = 10;
      const preferences: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight,
        crewWeight: 1,
        adaptiveBoost: 1.0,
        intValue: -1 // Prefer early, but got middle
      }];

      const score = scoreTimingPreferences(midBreakAssignments, preferences, storeConfig, breakRoleIds).score;

      // 50% satisfaction * baseWeight
      expect(score).toBe(5); // 0.5 * 10 * 1 * 1
    });
  });

  describe('CONSECUTIVE preference baseWeight (penalty)', () => {
    const assignments: SolverAssignment[] = [
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Switch 1
      { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 }, // Switch 2
    ];

    it('should scale penalty linearly with baseWeight', () => {
      const weights = [1, 2, 5, 10];
      const scores: number[] = [];

      for (const baseWeight of weights) {
        const preferences: PreferenceConfig[] = [{
          crewId: 'CREW001',
          roleId: null,
          preferenceType: 'CONSECUTIVE',
          baseWeight,
          crewWeight: 1,
          adaptiveBoost: 1.0
        }];

        const result = scoreConsecutivePreferences(assignments, preferences, storeConfig);
        scores.push(result.score);
      }

      // 2 switches, penalties scale with baseWeight
      expect(scores[0]).toBe(-2);  // -2 * 1 * 1 * 1 = -2
      expect(scores[1]).toBe(-4);  // -2 * 2 * 1 * 1 = -4
      expect(scores[2]).toBe(-10); // -2 * 5 * 1 * 1 = -10
      expect(scores[3]).toBe(-20); // -2 * 10 * 1 * 1 = -20
    });

    it('should differentiate penalty severity with baseWeight', () => {
      const lowPenalty: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      }];

      const highPenalty: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 50, // Very high penalty for switches
        crewWeight: 1,
        adaptiveBoost: 1.0
      }];

      const lowScore = scoreConsecutivePreferences(assignments, lowPenalty, storeConfig).score;
      const highScore = scoreConsecutivePreferences(assignments, highPenalty, storeConfig).score;

      expect(lowScore).toBe(-2);   // -2 * 1 * 1 * 1
      expect(highScore).toBe(-100); // -2 * 50 * 1 * 1
      expect(Math.abs(highScore)).toBe(Math.abs(lowScore) * 50);
    });
  });

  describe('Cross-preference baseWeight comparison', () => {
    it('should allow balancing different preference types via baseWeight', () => {
      // Scenario: Crew has both FIRST_HOUR and FAVORITE preferences
      // We can use baseWeight to prioritize one over the other

      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // First hour on role 1
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Rest on role 2
        { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 660 },
      ];

      // Scenario A: Prioritize FIRST_HOUR (high baseWeight)
      const prioritizeFirstHour: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 100, // High priority
          crewWeight: 1,
          adaptiveBoost: 1.0
        },
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight: 1, // Low priority
          crewWeight: 1,
          adaptiveBoost: 1.0
        }
      ];

      const firstHourScore = scoreFirstHourPreferences(
        assignments, 
        prioritizeFirstHour.filter(p => p.preferenceType === 'FIRST_HOUR'), 
        []
      ).score;

      const favoriteScore = scoreFavoritePreferences(
        assignments,
        prioritizeFirstHour.filter(p => p.preferenceType === 'FAVORITE'),
        []
      ).score;

      expect(firstHourScore).toBe(100); // Satisfied: role 1 in first hour
      expect(favoriteScore).toBe(60);   // 60 min on role 1 * 1
      expect(firstHourScore).toBeGreaterThan(favoriteScore);

      // Scenario B: Prioritize FAVORITE (high baseWeight)
      const prioritizeFavorite: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 1, // Low priority
          crewWeight: 1,
          adaptiveBoost: 1.0
        },
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight: 10, // High priority
          crewWeight: 1,
          adaptiveBoost: 1.0
        }
      ];

      const firstHourScore2 = scoreFirstHourPreferences(
        assignments,
        prioritizeFavorite.filter(p => p.preferenceType === 'FIRST_HOUR'),
        []
      ).score;

      const favoriteScore2 = scoreFavoritePreferences(
        assignments,
        prioritizeFavorite.filter(p => p.preferenceType === 'FAVORITE'),
        []
      ).score;

      expect(firstHourScore2).toBe(1);   // Satisfied but low weight
      expect(favoriteScore2).toBe(600);  // 60 min * 10
      expect(favoriteScore2).toBeGreaterThan(firstHourScore2 * 100);
    });
  });

  describe('baseWeight edge cases', () => {
    const assignments: SolverAssignment[] = [
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
    ];

    it('should handle baseWeight of 0', () => {
      const preferences: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 0,
        crewWeight: 100,
        adaptiveBoost: 100
      }];

      const result = scoreFirstHourPreferences(assignments, preferences, []);
      
      expect(result.score).toBe(0); // Even with high crewWeight, baseWeight=0 means no score
    });

    it('should handle very large baseWeight values', () => {
      const preferences: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1000000,
        crewWeight: 1,
        adaptiveBoost: 1.0
      }];

      const result = scoreFirstHourPreferences(assignments, preferences, []);
      
      expect(result.score).toBe(1000000);
    });

    it('should handle fractional baseWeight values', () => {
      const preferences: PreferenceConfig[] = [{
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 0.5,
        crewWeight: 10,
        adaptiveBoost: 1.0
      }];

      const result = scoreFirstHourPreferences(assignments, preferences, []);
      
      expect(result.score).toBe(5); // 0.5 * 10 * 1
    });
  });
});
