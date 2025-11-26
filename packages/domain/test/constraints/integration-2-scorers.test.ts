/**
 * Integration Test #2: Multi-Scorer Integration
 * 
 * Tests multiple preference scorers working together on the same assignments.
 * Verifies that scores aggregate correctly and weights flow through properly.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreFirstHourPreferences,
  scoreFavoritePreferences,
  scoreConsecutivePreferences,
  scoreTimingPreferences,
} from '../../src/constraints';

import type {
  SolverAssignment,
  StoreConfig,
  CrewConfig,
  PreferenceConfig,
} from '../../src/constraints/types';

describe('Integration #2: Multi-Scorer', () => {
  const store: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,
    closeMinutesFromMidnight: 1260,
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270,
  };

  const crew: CrewConfig[] = [
    {
      id: 'CREW001',
      name: 'Alice',
      qualifiedRoleIds: [1, 2, 3],
      cachedShiftStartMin: 480,
      cachedShiftEndMin: 1260,
    },
    {
      id: 'CREW002',
      name: 'Bob',
      qualifiedRoleIds: [1, 2],
      cachedShiftStartMin: 600,
      cachedShiftEndMin: 1140,
    },
  ];

  const breakRoleIds = [999];

  describe('API Signatures - Verify correct parameters', () => {
    it('scoreFirstHourPreferences(assignments, preferences, crew)', () => {
      const result = scoreFirstHourPreferences([], [], crew);
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('details');
    });

    it('scoreFavoritePreferences(assignments, preferences, crew)', () => {
      const result = scoreFavoritePreferences([], [], crew);
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('details');
    });

    it('scoreConsecutivePreferences(assignments, preferences, storeConfig)', () => {
      const result = scoreConsecutivePreferences([], [], store);
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('details');
    });

    it('scoreTimingPreferences(assignments, preferences, storeConfig, breakRoleIds)', () => {
      const result = scoreTimingPreferences([], [], store, breakRoleIds);
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('details');
    });
  });

  describe('Two scorers - FIRST_HOUR + FAVORITE', () => {
    it('should calculate both scores independently', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 960 },
      ];

      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.0,
          adaptiveBoost: 1.0,
        },
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight: 5,
          crewWeight: 1.0,
          adaptiveBoost: 1.0,
        },
      ];

      const firstHourScore = scoreFirstHourPreferences(assignments, preferences, crew);
      const favoriteScore = scoreFavoritePreferences(assignments, preferences, crew);

      expect(firstHourScore.score).toBe(10);
      expect(favoriteScore.score).toBe(2400);

      const total = firstHourScore.score + favoriteScore.score;
      expect(total).toBe(2410);
    });

    it('should handle weight multipliers correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 600 },
      ];

      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.5,
          adaptiveBoost: 2.0,
        },
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight: 10,
          crewWeight: 1.5,
          adaptiveBoost: 2.0,
        },
      ];

      const firstHourScore = scoreFirstHourPreferences(assignments, preferences, crew);
      const favoriteScore = scoreFavoritePreferences(assignments, preferences, crew);

      expect(firstHourScore.score).toBe(30);
      expect(favoriteScore.score).toBe(3600);
    });
  });

  describe('Three scorers - FIRST_HOUR + FAVORITE + CONSECUTIVE', () => {
    it('should aggregate all three scores', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 720, endMinutes: 960 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const scores = {
        firstHour: scoreFirstHourPreferences(assignments, preferences, crew),
        favorite: scoreFavoritePreferences(assignments, preferences, crew),
        consecutive: scoreConsecutivePreferences(assignments, preferences, store),
      };

      expect(scores.firstHour.score).toBe(10);
      expect(scores.favorite.score).toBe(2400);
      expect(scores.consecutive.score).toBe(0);

      const total = scores.firstHour.score + scores.favorite.score + scores.consecutive.score;
      expect(total).toBe(2410);
    });

    it('should penalize role switches', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 660 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const result = scoreConsecutivePreferences(assignments, preferences, store);
      expect(result.score).toBeLessThan(0);
    });
  });

  describe('All four scorers together', () => {
    it('should aggregate all 4 scorers', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },
        { crewId: 'CREW001', roleId: 999, startMinutes: 720, endMinutes: 750 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 750, endMinutes: 960 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: null, preferenceType: 'TIMING', intValue: 0, baseWeight: 15, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const scores = {
        firstHour: scoreFirstHourPreferences(assignments, preferences, crew),
        favorite: scoreFavoritePreferences(assignments, preferences, crew),
        timing: scoreTimingPreferences(assignments, preferences, store, breakRoleIds),
        consecutive: scoreConsecutivePreferences(assignments, preferences, store),
      };

      expect(scores.firstHour.score).toBeGreaterThan(0);
      expect(scores.favorite.score).toBeGreaterThan(0);
      // Timing score might be 0 if break timing doesn't match preferences
      expect(scores.timing.score).toBeGreaterThanOrEqual(0);
      // Consecutive will be negative (break causes 2 role switches: 1→999→1)
      expect(scores.consecutive.score).toBeLessThan(0);

      const total = scores.firstHour.score + scores.favorite.score + scores.timing.score + scores.consecutive.score;
      // Total should still be positive (firstHour + favorite > consecutive penalty)
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('Multiple crew - Score aggregation', () => {
    it('should aggregate across crew members', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 720, endMinutes: 960 },
        { crewId: 'CREW002', roleId: 2, startMinutes: 600, endMinutes: 900 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 8, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const firstHourScore = scoreFirstHourPreferences(assignments, preferences, crew);
      const favoriteScore = scoreFavoritePreferences(assignments, preferences, crew);

      expect(firstHourScore.score).toBe(10);
      expect(favoriteScore.score).toBe(4800);
    });

    it('should apply fairness boost independently per crew', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 600 },
        { crewId: 'CREW002', roleId: 2, startMinutes: 480, endMinutes: 600 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 2.0 },
      ];

      const favoriteScore = scoreFavoritePreferences(assignments, preferences, crew);
      expect(favoriteScore.score).toBe(3600);
    });
  });

  describe('Weight calculation - baseWeight × crewWeight × adaptiveBoost', () => {
    it('should apply all multipliers correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.2,
          adaptiveBoost: 1.5,
        },
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight: 10,
          crewWeight: 1.2,
          adaptiveBoost: 1.5,
        },
      ];

      const firstHourScore = scoreFirstHourPreferences(assignments, preferences, crew);
      const favoriteScore = scoreFavoritePreferences(assignments, preferences, crew);

      expect(firstHourScore.score).toBe(18);
      expect(favoriteScore.score).toBe(1080);
    });
  });

  describe('Performance - Many assignments', () => {
    it('should handle 100 assignments efficiently', () => {
      const largeSchedule: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];

      for (let i = 0; i < 100; i++) {
        const crewId = `CREW${String(i % 10).padStart(3, '0')}`;
        
        largeSchedule.push({
          crewId,
          roleId: (i % 3) + 1,
          startMinutes: 480 + (i * 5),
          endMinutes: 540 + (i * 5),
        });

        if (i % 10 === 0) {
          preferences.push(
            { crewId, roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
            { crewId, roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 }
          );
        }
      }

      const startTime = Date.now();

      scoreFirstHourPreferences(largeSchedule, preferences, crew);
      scoreFavoritePreferences(largeSchedule, preferences, crew);
      scoreConsecutivePreferences(largeSchedule, preferences, store);
      scoreTimingPreferences(largeSchedule, preferences, store, breakRoleIds);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50);
    });
  });
});
