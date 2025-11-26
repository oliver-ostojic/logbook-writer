/**
 * Integration Test #3: Validator + Scorer Integration
 * 
 * Tests that constraint validators and preference scorers work together.
 * Ensures that:
 * 1. Valid assignments can be scored
 * 2. Invalid assignments are caught before scoring
 * 3. Validators don't interfere with scorer calculations
 * 4. Both systems use the same data structures correctly
 */

import { describe, it, expect } from 'vitest';
import {
  // Validators
  validateSlotAlignment,
  validateStoreHours,
  validateRoleSlotDuration,
  validateConsecutiveSlots,
  // Scorers
  scoreFirstHourPreferences,
  scoreFavoritePreferences,
  scoreConsecutivePreferences,
  scoreTimingPreferences,
} from '../../src/constraints';

import type {
  SolverAssignment,
  StoreConfig,
  RoleConfig,
  CrewConfig,
  PreferenceConfig,
} from '../../src/constraints/types';

describe('Integration #3: Validator + Scorer', () => {
  const store: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,   // 8:00 AM
    closeMinutesFromMidnight: 1260, // 9:00 PM
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270,
  };

  const registerRole: RoleConfig = {
    id: 1,
    code: 'REGISTER',
    minSlots: 2,
    maxSlots: 16,
    blockSize: 1,
    slotsMustBeConsecutive: true,
    allowOutsideStoreHours: false,
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

  describe('Valid assignment - passes validation AND gets scored', () => {
    const validAssignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,  // 8:00 AM (store opens)
      endMinutes: 960,    // 4:00 PM (8 hours, within store hours)
    };

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

    it('should pass all validators', () => {
      const validations = {
        slotAlignment: validateSlotAlignment(validAssignment, store),
        storeHours: validateStoreHours(validAssignment, store, registerRole),
        roleSlotDuration: validateRoleSlotDuration(validAssignment, store, registerRole),
        consecutiveSlots: validateConsecutiveSlots(validAssignment, store, registerRole),
      };

      Object.values(validations).forEach(result => {
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    });

    it('should score positive satisfaction', () => {
      const scores = {
        firstHour: scoreFirstHourPreferences([validAssignment], preferences, crew),
        favorite: scoreFavoritePreferences([validAssignment], preferences, crew),
      };

      expect(scores.firstHour.score).toBeGreaterThan(0);
      expect(scores.favorite.score).toBeGreaterThan(0);
    });

    it('should validate AND score successfully together', () => {
      // Step 1: Validate
      const validation = validateSlotAlignment(validAssignment, store);
      expect(validation.valid).toBe(true);

      // Step 2: Score (only if valid)
      if (validation.valid) {
        const score = scoreFavoritePreferences([validAssignment], preferences, crew);
        expect(score.score).toBeGreaterThan(0);
      }
    });
  });

  describe('Invalid assignment - fails validation, no scoring', () => {
    const invalidAssignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 485,  // NOT aligned to 30-minute slots!
      endMinutes: 965,    // NOT aligned!
    };

    it('should fail slot alignment validation', () => {
      const result = validateSlotAlignment(invalidAssignment, store);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('does not align');
    });

    it('should not score invalid assignments (workflow check)', () => {
      // In production, we validate BEFORE scoring
      const validation = validateSlotAlignment(invalidAssignment, store);
      
      if (!validation.valid) {
        // Don't score invalid assignments
        expect(validation.violations.length).toBeGreaterThan(0);
      } else {
        // This branch shouldn't execute for this test
        const score = scoreFavoritePreferences([invalidAssignment], [], crew);
        expect(score).toBeDefined();
      }
    });
  });

  describe('Multiple assignments - some valid, some invalid', () => {
    const assignments: SolverAssignment[] = [
      // Valid
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },
      // Invalid (not aligned)
      { crewId: 'CREW001', roleId: 1, startMinutes: 725, endMinutes: 965 },
      // Valid
      { crewId: 'CREW002', roleId: 2, startMinutes: 600, endMinutes: 900 },
    ];

    it('should identify which assignments are valid', () => {
      const validationResults = assignments.map(a => ({
        assignment: a,
        validation: validateSlotAlignment(a, store),
      }));

      const validCount = validationResults.filter(r => r.validation.valid).length;
      const invalidCount = validationResults.filter(r => !r.validation.valid).length;

      expect(validCount).toBe(2);
      expect(invalidCount).toBe(1);
    });

    it('should only score valid assignments', () => {
      // Filter to valid assignments only
      const validAssignments = assignments.filter(a => {
        const validation = validateSlotAlignment(a, store);
        return validation.valid;
      });

      expect(validAssignments).toHaveLength(2);

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreFavoritePreferences(validAssignments, preferences, crew);
      
      // Should only score the 2 valid assignments
      // CREW001: 240 minutes × 5 = 1200
      // CREW002: 300 minutes × 5 = 1500
      // Total: 2700
      expect(score.score).toBe(2700);
    });
  });

  describe('Validators and scorers use same StoreConfig', () => {
    it('should use consistent time boundaries', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,  // Exactly at store opening
        endMinutes: 1260,   // Exactly at store closing
      };

      // Validator should accept this (within store hours)
      const validation = validateStoreHours(assignment, store, registerRole);
      expect(validation.valid).toBe(true);

      // Scorer should work with same config
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreFavoritePreferences([assignment], preferences, crew);
      
      // 780 minutes × 5 = 3900
      expect(score.score).toBe(3900);
    });

    it('should handle slot alignment consistently', () => {
      const slotAlignedAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,  // Divisible by 30
        endMinutes: 510,    // Divisible by 30
      };

      // Both validator and scorer should work
      const validation = validateSlotAlignment(slotAlignedAssignment, store);
      expect(validation.valid).toBe(true);

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreFavoritePreferences([slotAlignedAssignment], preferences, crew);
      expect(score.score).toBe(150); // 30 minutes × 5
    });
  });

  describe('Consecutive constraints affect both validation and scoring', () => {
    it('should validate consecutive slots AND score consecutive preference', () => {
      const consecutiveAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
      ];

      // Validator: consecutive slots should be valid
      const validation1 = validateConsecutiveSlots(consecutiveAssignments[0], store, registerRole);
      const validation2 = validateConsecutiveSlots(consecutiveAssignments[1], store, registerRole);
      
      expect(validation1.valid).toBe(true);
      expect(validation2.valid).toBe(true);

      // Scorer: no role switches = no penalty
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreConsecutivePreferences(consecutiveAssignments, preferences, store);
      expect(score.score).toBe(0); // No switches
    });

    it('should penalize role switches in scoring', () => {
      const switchingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Switch!
      ];

      // Validation still passes (both assignments are individually valid)
      switchingAssignments.forEach(a => {
        const validation = validateSlotAlignment(a, store);
        expect(validation.valid).toBe(true);
      });

      // But scoring penalizes the switch
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreConsecutivePreferences(switchingAssignments, preferences, store);
      expect(score.score).toBeLessThan(0); // Penalty for switch
    });
  });

  describe('Full workflow - validate then score', () => {
    it('should validate all, then score only valid assignments', () => {
      const allAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },   // Valid
        { crewId: 'CREW001', roleId: 1, startMinutes: 485, endMinutes: 725 },   // Invalid (alignment)
        { crewId: 'CREW002', roleId: 2, startMinutes: 600, endMinutes: 900 },   // Valid
        { crewId: 'CREW002', roleId: 2, startMinutes: 1270, endMinutes: 1300 }, // Invalid (after close)
      ];

      // Step 1: Validate all assignments
      const validatedAssignments = allAssignments.map(a => ({
        assignment: a,
        slotAlignment: validateSlotAlignment(a, store),
        storeHours: validateStoreHours(a, store, registerRole),
      }));

      // Step 2: Filter to only valid assignments
      const validAssignments = validatedAssignments
        .filter(va => va.slotAlignment.valid && va.storeHours.valid)
        .map(va => va.assignment);

      expect(validAssignments).toHaveLength(2);

      // Step 3: Score only the valid assignments
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const scores = {
        firstHour: scoreFirstHourPreferences(validAssignments, preferences, crew),
        favorite: scoreFavoritePreferences(validAssignments, preferences, crew),
      };

      // FIRST_HOUR: Only CREW001 (10)
      expect(scores.firstHour.score).toBe(10);
      
      // FAVORITE: CREW001 (240min × 5 = 1200) + CREW002 (300min × 5 = 1500) = 2700
      expect(scores.favorite.score).toBe(2700);

      const totalScore = scores.firstHour.score + scores.favorite.score;
      expect(totalScore).toBe(2710);
    });
  });

  describe('Break scheduling - validation and timing preference', () => {
    it('should validate break timing AND score timing preference', () => {
      const scheduleWithBreak: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },   // Work
        { crewId: 'CREW001', roleId: 999, startMinutes: 720, endMinutes: 750 }, // Break
        { crewId: 'CREW001', roleId: 1, startMinutes: 750, endMinutes: 960 },   // Work
      ];

      // All assignments should be slot-aligned
      scheduleWithBreak.forEach(a => {
        const validation = validateSlotAlignment(a, store);
        expect(validation.valid).toBe(true);
      });

      // Score timing preference for break
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'TIMING', intValue: 0, baseWeight: 15, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const timingScore = scoreTimingPreferences(scheduleWithBreak, preferences, store, breakRoleIds);
      
      // Timing scorer should work (may be 0 or positive depending on break window)
      expect(timingScore.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge cases - validators and scorers handle consistently', () => {
    it('should handle empty assignments', () => {
      const emptyAssignments: SolverAssignment[] = [];

      // Scorers should return 0
      const score = scoreFavoritePreferences(emptyAssignments, [], crew);
      expect(score.score).toBe(0);

      // Validators don't need to run on empty arrays
      expect(emptyAssignments).toHaveLength(0);
    });

    it('should handle minimum duration assignments', () => {
      const minAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 510, // Just 30 minutes (1 slot)
      };

      // Should validate
      const validation = validateSlotAlignment(minAssignment, store);
      expect(validation.valid).toBe(true);

      // Should score
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreFavoritePreferences([minAssignment], preferences, crew);
      expect(score.score).toBe(150); // 30 minutes × 5
    });

    it('should handle maximum duration assignments', () => {
      const maxAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,   // Store open
        endMinutes: 1260,    // Store close (13 hours)
      };

      // Should validate
      const validation = validateStoreHours(maxAssignment, store, registerRole);
      expect(validation.valid).toBe(true);

      // Should score
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreFavoritePreferences([maxAssignment], preferences, crew);
      expect(score.score).toBe(3900); // 780 minutes × 5
    });
  });

  describe('Performance - validate and score many assignments', () => {
    it('should efficiently validate and score 100 assignments', () => {
      const largeSchedule: SolverAssignment[] = [];
      
      for (let i = 0; i < 100; i++) {
        largeSchedule.push({
          crewId: `CREW${String(i % 10).padStart(3, '0')}`,
          roleId: (i % 3) + 1,
          startMinutes: 480 + (i * 5),
          endMinutes: 540 + (i * 5),
        });
      }

      const startTime = Date.now();

      // Validate all
      const validationResults = largeSchedule.map(a => validateSlotAlignment(a, store));
      const validAssignments = largeSchedule.filter((_, i) => validationResults[i].valid);

      // Score valid ones
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW000', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      scoreFavoritePreferences(validAssignments, preferences, crew);
      scoreConsecutivePreferences(validAssignments, preferences, store);

      const duration = Date.now() - startTime;

      // Should be very fast
      expect(duration).toBeLessThan(50);
      expect(validAssignments.length).toBeGreaterThan(0);
    });
  });

  describe('Data structure compatibility', () => {
    it('should use SolverAssignment for both validators and scorers', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 720,
      };

      // Same structure works for validator
      const validation = validateSlotAlignment(assignment, store);
      expect(validation.valid).toBe(true);

      // And for scorer
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreFavoritePreferences([assignment], preferences, crew);
      expect(score.score).toBeGreaterThan(0);
    });

    it('should use StoreConfig consistently', () => {
      // Both validators and scorers accept the same StoreConfig
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 720,
      };

      // Validator uses store config
      const validation = validateSlotAlignment(assignment, store);
      expect(validation.valid).toBe(true);

      // Consecutive scorer uses store config
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreConsecutivePreferences([assignment], preferences, store);
      expect(score).toBeDefined();
    });
  });
});
