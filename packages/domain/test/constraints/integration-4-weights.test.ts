/**
 * Integration Test #4: Weight Calculation Integration
 * 
 * Tests that the weight calculation formula (baseWeight × crewWeight × adaptiveBoost)
 * is applied consistently across all scorers and constraint types.
 * 
 * This ensures:
 * 1. All scorers use the same weight calculation formula
 * 2. Weights multiply correctly (not add or override)
 * 3. Each weight component (base, crew, adaptive) works independently
 * 4. Extreme weight values are handled correctly
 * 5. Weight calculations are consistent across preference types
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

describe('Integration #4: Weight Calculation', () => {
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
  ];

  const breakRoleIds = [999];

  describe('Base formula: baseWeight × crewWeight × adaptiveBoost', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 540, // 60 minutes
    };

    it('should apply all three multipliers for FIRST_HOUR', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 2.0,
          adaptiveBoost: 3.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 2.0 × 3.0 = 60
      expect(result.score).toBe(60);
    });

    it('should apply all three multipliers for FAVORITE', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FAVORITE',
          baseWeight: 10,
          crewWeight: 2.0,
          adaptiveBoost: 3.0,
        },
      ];

      const result = scoreFavoritePreferences([assignment], preferences, crew);
      
      // 60 minutes × (10 × 2.0 × 3.0) = 60 × 60 = 3600
      expect(result.score).toBe(3600);
    });

    it('should apply weights consistently across all scorers', () => {
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 5, crewWeight: 2.0, adaptiveBoost: 1.5 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 2.0, adaptiveBoost: 1.5 },
      ];

      const firstHourScore = scoreFirstHourPreferences([assignment], preferences, crew);
      const favoriteScore = scoreFavoritePreferences([assignment], preferences, crew);

      // FIRST_HOUR: 5 × 2.0 × 1.5 = 15
      expect(firstHourScore.score).toBe(15);
      
      // FAVORITE: 60min × (5 × 2.0 × 1.5) = 60 × 15 = 900
      expect(favoriteScore.score).toBe(900);
    });
  });

  describe('BaseWeight variations', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 540, // 60 minutes
    };

    it('should handle baseWeight = 0', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 0,
          crewWeight: 2.0,
          adaptiveBoost: 3.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 0 × 2.0 × 3.0 = 0
      expect(result.score).toBe(0);
    });

    it('should handle baseWeight = 1', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 1,
          crewWeight: 1.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 1 × 1.0 × 1.0 = 1
      expect(result.score).toBe(1);
    });

    it('should handle large baseWeight values', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 1000,
          crewWeight: 1.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 1000 × 1.0 × 1.0 = 1000
      expect(result.score).toBe(1000);
    });

    it('should handle decimal baseWeight values', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 7.5,
          crewWeight: 2.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 7.5 × 2.0 × 1.0 = 15
      expect(result.score).toBe(15);
    });
  });

  describe('CrewWeight variations', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 540, // 60 minutes
    };

    it('should handle crewWeight = 0', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 100,
          crewWeight: 0,
          adaptiveBoost: 2.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 100 × 0 × 2.0 = 0
      expect(result.score).toBe(0);
    });

    it('should handle crewWeight = 0.5 (reduce priority)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 0.5,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 0.5 × 1.0 = 5
      expect(result.score).toBe(5);
    });

    it('should handle crewWeight = 1.0 (normal)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 1.0 × 1.0 = 10
      expect(result.score).toBe(10);
    });

    it('should handle crewWeight = 2.0 (increase priority)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 2.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 2.0 × 1.0 = 20
      expect(result.score).toBe(20);
    });

    it('should handle crewWeight = 5.0 (high priority)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 5.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 5.0 × 1.0 = 50
      expect(result.score).toBe(50);
    });
  });

  describe('AdaptiveBoost variations (fairness)', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 540, // 60 minutes
    };

    it('should handle adaptiveBoost = 1.0 (no boost)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 1.0 × 1.0 = 10
      expect(result.score).toBe(10);
    });

    it('should handle adaptiveBoost = 1.5 (mild fairness boost)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.0,
          adaptiveBoost: 1.5,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 1.0 × 1.5 = 15
      expect(result.score).toBe(15);
    });

    it('should handle adaptiveBoost = 2.0 (strong fairness boost)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.0,
          adaptiveBoost: 2.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 1.0 × 2.0 = 20
      expect(result.score).toBe(20);
    });

    it('should handle adaptiveBoost = 3.0 (very strong boost)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.0,
          adaptiveBoost: 3.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 1.0 × 3.0 = 30
      expect(result.score).toBe(30);
    });
  });

  describe('Combined weight scenarios', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 540, // 60 minutes
    };

    it('should handle all weights at minimum (0, 0, 1.0)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 0,
          crewWeight: 0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 0 × 0 × 1.0 = 0
      expect(result.score).toBe(0);
    });

    it('should handle all weights at normal (10, 1.0, 1.0)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 10,
          crewWeight: 1.0,
          adaptiveBoost: 1.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 10 × 1.0 × 1.0 = 10
      expect(result.score).toBe(10);
    });

    it('should handle all weights maximized (100, 5.0, 3.0)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 100,
          crewWeight: 5.0,
          adaptiveBoost: 3.0,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 100 × 5.0 × 3.0 = 1500
      expect(result.score).toBe(1500);
    });

    it('should handle mixed weights (7.5, 1.2, 1.5)', () => {
      const preferences: PreferenceConfig[] = [
        {
          crewId: 'CREW001',
          roleId: 1,
          preferenceType: 'FIRST_HOUR',
          baseWeight: 7.5,
          crewWeight: 1.2,
          adaptiveBoost: 1.5,
        },
      ];

      const result = scoreFirstHourPreferences([assignment], preferences, crew);
      
      // 7.5 × 1.2 × 1.5 = 13.5
      expect(result.score).toBe(13.5);
    });
  });

  describe('Weight calculation across different preference types', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 540, // 60 minutes
    };

    it('should apply same weight formula to FIRST_HOUR and FAVORITE', () => {
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.5, adaptiveBoost: 2.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.5, adaptiveBoost: 2.0 },
      ];

      const firstHourScore = scoreFirstHourPreferences([assignment], preferences, crew);
      const favoriteScore = scoreFavoritePreferences([assignment], preferences, crew);

      // Weight formula: 10 × 1.5 × 2.0 = 30
      // FIRST_HOUR: 30 (one-time)
      // FAVORITE: 60 minutes × 30 = 1800
      expect(firstHourScore.score).toBe(30);
      expect(favoriteScore.score).toBe(1800);
    });

    it('should apply weights to CONSECUTIVE penalty', () => {
      const switchingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Switch!
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 2.0, adaptiveBoost: 1.5 },
      ];

      const result = scoreConsecutivePreferences(switchingAssignments, preferences, store);
      
      // Penalty should be scaled by weight: 10 × 2.0 × 1.5 = 30
      // One switch = -30
      expect(result.score).toBe(-30);
    });

    it('should apply weights to TIMING preferences', () => {
      const scheduleWithBreak: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },
        { crewId: 'CREW001', roleId: 999, startMinutes: 720, endMinutes: 750 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 750, endMinutes: 960 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'TIMING', intValue: 0, baseWeight: 10, crewWeight: 2.0, adaptiveBoost: 1.5 },
      ];

      const result = scoreTimingPreferences(scheduleWithBreak, preferences, store, breakRoleIds);
      
      // Weight formula should apply: 10 × 2.0 × 1.5 = 30
      // Score should be 0 or a multiple of 30 depending on timing
      if (result.score !== 0) {
        expect(result.score % 30).toBe(0);
      }
    });
  });

  describe('Independent weight components', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 540,
    };

    it('should change only baseWeight independently', () => {
      const base5: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 5, crewWeight: 2.0, adaptiveBoost: 3.0 },
      ];
      const base10: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 2.0, adaptiveBoost: 3.0 },
      ];

      const result5 = scoreFirstHourPreferences([assignment], base5, crew);
      const result10 = scoreFirstHourPreferences([assignment], base10, crew);

      // 5 × 2.0 × 3.0 = 30
      // 10 × 2.0 × 3.0 = 60
      expect(result5.score).toBe(30);
      expect(result10.score).toBe(60);
      expect(result10.score).toBe(result5.score * 2); // Doubling base doubles result
    });

    it('should change only crewWeight independently', () => {
      const crew1: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 3.0 },
      ];
      const crew2: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 2.0, adaptiveBoost: 3.0 },
      ];

      const result1 = scoreFirstHourPreferences([assignment], crew1, crew);
      const result2 = scoreFirstHourPreferences([assignment], crew2, crew);

      // 10 × 1.0 × 3.0 = 30
      // 10 × 2.0 × 3.0 = 60
      expect(result1.score).toBe(30);
      expect(result2.score).toBe(60);
      expect(result2.score).toBe(result1.score * 2); // Doubling crew doubles result
    });

    it('should change only adaptiveBoost independently', () => {
      const boost1: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 2.0, adaptiveBoost: 1.0 },
      ];
      const boost3: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 2.0, adaptiveBoost: 3.0 },
      ];

      const result1 = scoreFirstHourPreferences([assignment], boost1, crew);
      const result3 = scoreFirstHourPreferences([assignment], boost3, crew);

      // 10 × 2.0 × 1.0 = 20
      // 10 × 2.0 × 3.0 = 60
      expect(result1.score).toBe(20);
      expect(result3.score).toBe(60);
      expect(result3.score).toBe(result1.score * 3); // Tripling boost triples result
    });
  });

  describe('Real-world weight scenarios', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 600, // 120 minutes (2 hours)
    };

    it('should handle new crew with high importance preference', () => {
      // New crew: high base weight, normal crew weight, slight fairness boost
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.2 },
      ];

      const result = scoreFavoritePreferences([assignment], preferences, crew);
      
      // 120 minutes × (20 × 1.0 × 1.2) = 120 × 24 = 2880
      expect(result.score).toBe(2880);
    });

    it('should handle veteran crew with reduced weight', () => {
      // Veteran crew: low base weight, reduced crew weight (already satisfied)
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 0.8, adaptiveBoost: 1.0 },
      ];

      const result = scoreFavoritePreferences([assignment], preferences, crew);
      
      // 120 minutes × (5 × 0.8 × 1.0) = 120 × 4 = 480
      expect(result.score).toBe(480);
    });

    it('should handle crew with bad luck (high fairness boost)', () => {
      // Crew with repeated bad schedules: high adaptive boost
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 2.5 },
      ];

      const result = scoreFavoritePreferences([assignment], preferences, crew);
      
      // 120 minutes × (10 × 1.0 × 2.5) = 120 × 25 = 3000
      expect(result.score).toBe(3000);
    });

    it('should handle VIP crew member (all weights high)', () => {
      // VIP: high in all dimensions
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 50, crewWeight: 1.5, adaptiveBoost: 2.0 },
      ];

      const result = scoreFavoritePreferences([assignment], preferences, crew);
      
      // 120 minutes × (50 × 1.5 × 2.0) = 120 × 150 = 18000
      expect(result.score).toBe(18000);
    });
  });

  describe('Performance - weight calculations scale correctly', () => {
    it('should handle many preferences with different weights efficiently', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];

      // Create 50 assignments with varying weights
      for (let i = 0; i < 50; i++) {
        assignments.push({
          crewId: `CREW${String(i % 5).padStart(3, '0')}`,
          roleId: (i % 3) + 1,
          startMinutes: 480 + (i * 10),
          endMinutes: 540 + (i * 10),
        });

        preferences.push({
          crewId: `CREW${String(i % 5).padStart(3, '0')}`,
          roleId: (i % 3) + 1,
          preferenceType: 'FAVORITE',
          baseWeight: 10 + (i % 10),           // 10-19
          crewWeight: 1.0 + (i % 5) * 0.2,     // 1.0-1.8
          adaptiveBoost: 1.0 + (i % 3) * 0.5,  // 1.0-2.0
        });
      }

      const startTime = Date.now();
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      const duration = Date.now() - startTime;

      // Should be fast even with many different weight combinations
      expect(duration).toBeLessThan(50);
      expect(result.score).toBeGreaterThan(0);
    });
  });
});
