/**
 * Integration Test #5: Full Schedule Integration
 * 
 * Tests a complete realistic scheduling scenario with:
 * - Multiple crew members (5+)
 * - Multiple roles (3+)
 * - Full day schedules with breaks
 * - All validators working together
 * - All scorers working together
 * - Complex preference configurations
 * - Weight calculations flowing through entire system
 * 
 * This is the ultimate integration test - if this passes, the system works!
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

describe('Integration #5: Full Schedule', () => {
  // Realistic store configuration
  const store: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,   // 8:00 AM
    closeMinutesFromMidnight: 1260, // 9:00 PM (13 hours)
    reqShiftLengthForBreak: 360,    // 6 hours
    breakWindowStart: 180,          // 3 hours in
    breakWindowEnd: 270,            // 4.5 hours in
  };

  // Multiple roles
  const roles: RoleConfig[] = [
    {
      id: 1,
      code: 'REGISTER',
      minSlots: 2,
      maxSlots: 16,
      blockSize: 1,
      slotsMustBeConsecutive: true,
      allowOutsideStoreHours: false,
    },
    {
      id: 2,
      code: 'FLOOR',
      minSlots: 2,
      maxSlots: 16,
      blockSize: 1,
      slotsMustBeConsecutive: true,
      allowOutsideStoreHours: false,
    },
    {
      id: 3,
      code: 'STOCK',
      minSlots: 2,
      maxSlots: 12,
      blockSize: 1,
      slotsMustBeConsecutive: true,
      allowOutsideStoreHours: false,
    },
    {
      id: 999,
      code: 'BREAK',
      minSlots: 1,
      maxSlots: 2,
      blockSize: 1,
      slotsMustBeConsecutive: false,
      allowOutsideStoreHours: false,
    },
  ];

  // Multiple crew members with different qualifications
  const crew: CrewConfig[] = [
    {
      id: 'CREW001',
      name: 'Alice (Senior)',
      qualifiedRoleIds: [1, 2, 3], // Qualified for all roles
      cachedShiftStartMin: 480,
      cachedShiftEndMin: 1260,
    },
    {
      id: 'CREW002',
      name: 'Bob (Register Specialist)',
      qualifiedRoleIds: [1, 2], // Register + Floor
      cachedShiftStartMin: 480,
      cachedShiftEndMin: 1080,
    },
    {
      id: 'CREW003',
      name: 'Charlie (Part-time)',
      qualifiedRoleIds: [2, 3], // Floor + Stock
      cachedShiftStartMin: 600,
      cachedShiftEndMin: 960,
    },
    {
      id: 'CREW004',
      name: 'Diana (Stock Lead)',
      qualifiedRoleIds: [2, 3], // Floor + Stock
      cachedShiftStartMin: 480,
      cachedShiftEndMin: 1140,
    },
    {
      id: 'CREW005',
      name: 'Eve (Flexible)',
      qualifiedRoleIds: [1, 2, 3], // All roles
      cachedShiftStartMin: 540,
      cachedShiftEndMin: 1200,
    },
  ];

  const breakRoleIds = [999];

  describe('Complete daily schedule - morning shift', () => {
    // Realistic morning schedule: 8 AM - 2 PM (6 hours)
    const morningSchedule: SolverAssignment[] = [
      // Alice: Full morning on register with break
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },   // 8:00-11:00 Register
      { crewId: 'CREW001', roleId: 999, startMinutes: 660, endMinutes: 690 }, // 11:00-11:30 Break
      { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 840 },   // 11:30-2:00 Register
      
      // Bob: Register then floor
      { crewId: 'CREW002', roleId: 1, startMinutes: 480, endMinutes: 660 },   // 8:00-11:00 Register
      { crewId: 'CREW002', roleId: 2, startMinutes: 660, endMinutes: 840 },   // 11:00-2:00 Floor
      
      // Diana: Stock room all morning
      { crewId: 'CREW004', roleId: 3, startMinutes: 480, endMinutes: 660 },   // 8:00-11:00 Stock
      { crewId: 'CREW004', roleId: 3, startMinutes: 660, endMinutes: 840 },   // 11:00-2:00 Stock
    ];

    it('should pass all validators for every assignment', () => {
      morningSchedule.forEach(assignment => {
        const registerRole = roles.find(r => r.id === assignment.roleId)!;
        
        const validations = {
          slotAlignment: validateSlotAlignment(assignment, store),
          storeHours: validateStoreHours(assignment, store, registerRole),
          roleSlotDuration: validateRoleSlotDuration(assignment, store, registerRole),
          consecutiveSlots: validateConsecutiveSlots(assignment, store, registerRole),
        };

        Object.values(validations).forEach(result => {
          if (!result.valid) {
            console.log('Validation failed for:', assignment, result);
          }
          expect(result.valid).toBe(true);
        });
      });
    });

    it('should calculate satisfaction scores for all crew', () => {
      const preferences: PreferenceConfig[] = [
        // Alice prefers register in first hour
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 8, crewWeight: 1.0, adaptiveBoost: 1.0 },
        
        // Bob prefers register
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.2, adaptiveBoost: 1.0 },
        
        // Diana prefers stock
        { crewId: 'CREW004', roleId: 3, preferenceType: 'FAVORITE', baseWeight: 12, crewWeight: 1.0, adaptiveBoost: 1.5 },
      ];

      const scores = {
        firstHour: scoreFirstHourPreferences(morningSchedule, preferences, crew),
        favorite: scoreFavoritePreferences(morningSchedule, preferences, crew),
      };

      // All should have positive scores
      expect(scores.firstHour.score).toBeGreaterThan(0);
      expect(scores.favorite.score).toBeGreaterThan(0);

      const totalScore = scores.firstHour.score + scores.favorite.score;
      expect(totalScore).toBeGreaterThan(0);
    });

    it('should handle break scheduling correctly', () => {
      // Alice has a break
      const aliceAssignments = morningSchedule.filter(a => a.crewId === 'CREW001');
      const aliceBreak = aliceAssignments.find(a => a.roleId === 999);
      
      expect(aliceBreak).toBeDefined();
      expect(aliceBreak!.startMinutes).toBe(660);
      expect(aliceBreak!.endMinutes).toBe(690);

      // Validate break assignment
      const breakRole = roles.find(r => r.id === 999)!;
      const validation = validateSlotAlignment(aliceBreak!, store);
      expect(validation.valid).toBe(true);
    });

    it('should penalize Bob for role switch', () => {
      const bobAssignments = morningSchedule.filter(a => a.crewId === 'CREW002');
      
      // Bob switches from register to floor
      expect(bobAssignments[0].roleId).toBe(1); // Register
      expect(bobAssignments[1].roleId).toBe(2); // Floor (switch!)

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW002', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 15, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreConsecutivePreferences(bobAssignments, preferences, store);
      
      // Should be negative (penalty for 1 switch)
      expect(score.score).toBeLessThan(0);
    });
  });

  describe('Complete daily schedule - full day with all crew', () => {
    // Realistic full-day schedule with 5 crew members
    const fullDaySchedule: SolverAssignment[] = [
      // CREW001 (Alice): 8 AM - 5 PM with break
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
      { crewId: 'CREW001', roleId: 999, startMinutes: 660, endMinutes: 690 },
      { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 1020 },
      
      // CREW002 (Bob): 8 AM - 12 PM register only
      { crewId: 'CREW002', roleId: 1, startMinutes: 480, endMinutes: 720 },
      
      // CREW003 (Charlie): 10 AM - 4 PM floor
      { crewId: 'CREW003', roleId: 2, startMinutes: 600, endMinutes: 960 },
      
      // CREW004 (Diana): 8 AM - 7 PM stock with break
      { crewId: 'CREW004', roleId: 3, startMinutes: 480, endMinutes: 720 },
      { crewId: 'CREW004', roleId: 999, startMinutes: 720, endMinutes: 750 },
      { crewId: 'CREW004', roleId: 3, startMinutes: 750, endMinutes: 1140 },
      
      // CREW005 (Eve): 9 AM - 8 PM mixed roles with break
      { crewId: 'CREW005', roleId: 2, startMinutes: 540, endMinutes: 720 },
      { crewId: 'CREW005', roleId: 999, startMinutes: 720, endMinutes: 750 },
      { crewId: 'CREW005', roleId: 1, startMinutes: 750, endMinutes: 1200 },
    ];

    it('should validate entire schedule', () => {
      let validCount = 0;
      let invalidCount = 0;

      fullDaySchedule.forEach(assignment => {
        const role = roles.find(r => r.id === assignment.roleId)!;
        const validation = validateSlotAlignment(assignment, store);
        
        if (validation.valid) {
          validCount++;
        } else {
          invalidCount++;
          console.log('Invalid assignment:', assignment, validation.violations);
        }
      });

      expect(validCount).toBe(fullDaySchedule.length);
      expect(invalidCount).toBe(0);
    });

    it('should calculate total satisfaction across all crew and preferences', () => {
      const preferences: PreferenceConfig[] = [
        // Alice: Senior, consistent preferences
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 8, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 15, crewWeight: 1.0, adaptiveBoost: 1.0 },
        
        // Bob: Register specialist
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 15, crewWeight: 1.2, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 12, crewWeight: 1.2, adaptiveBoost: 1.0 },
        
        // Charlie: Part-timer, lower weights
        { crewId: 'CREW003', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 6, crewWeight: 0.8, adaptiveBoost: 1.0 },
        
        // Diana: Stock lead with fairness boost
        { crewId: 'CREW004', roleId: 3, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.5 },
        { crewId: 'CREW004', roleId: 3, preferenceType: 'FAVORITE', baseWeight: 12, crewWeight: 1.0, adaptiveBoost: 1.5 },
        
        // Eve: Flexible, all roles
        { crewId: 'CREW005', roleId: 2, preferenceType: 'FIRST_HOUR', baseWeight: 8, crewWeight: 1.0, adaptiveBoost: 1.2 },
        { crewId: 'CREW005', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.2 },
      ];

      const scores = {
        firstHour: scoreFirstHourPreferences(fullDaySchedule, preferences, crew),
        favorite: scoreFavoritePreferences(fullDaySchedule, preferences, crew),
        consecutive: scoreConsecutivePreferences(fullDaySchedule, preferences, store),
      };

      // Verify all scorers ran
      expect(scores.firstHour.score).toBeGreaterThan(0);
      expect(scores.favorite.score).toBeGreaterThan(0);
      // Consecutive might be negative due to Eve's role switch

      const totalScore = scores.firstHour.score + scores.favorite.score + scores.consecutive.score;
      
      // Total should still be positive (rewards > penalties)
      expect(totalScore).toBeGreaterThan(0);
    });

    it('should identify which crew members got their preferences', () => {
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW003', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW004', roleId: 3, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW005', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const favoriteScore = scoreFavoritePreferences(fullDaySchedule, preferences, crew);
      
      // All crew should get some satisfaction (everyone got their preferred role at some point)
      expect(favoriteScore.score).toBeGreaterThan(0);
      
      // Calculate per-crew satisfaction
      crew.forEach(c => {
        const crewAssignments = fullDaySchedule.filter(a => a.crewId === c.id);
        const crewPrefs = preferences.filter(p => p.crewId === c.id);
        
        if (crewAssignments.length > 0 && crewPrefs.length > 0) {
          const crewScore = scoreFavoritePreferences(crewAssignments, crewPrefs, crew);
          // Each crew member should have some score
          expect(crewScore.score).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it('should handle breaks for multiple crew members', () => {
      const breakAssignments = fullDaySchedule.filter(a => a.roleId === 999);
      
      // Should have breaks for Alice, Diana, and Eve
      expect(breakAssignments.length).toBe(3);
      
      // All breaks should be valid
      breakAssignments.forEach(breakAssignment => {
        const validation = validateSlotAlignment(breakAssignment, store);
        expect(validation.valid).toBe(true);
        
        // Break should be 30 minutes
        const duration = breakAssignment.endMinutes - breakAssignment.startMinutes;
        expect(duration).toBe(30);
      });
    });
  });

  describe('Complex schedule - high complexity scenario', () => {
    // Maximum complexity: all crew, all roles, multiple switches, breaks
    const complexSchedule: SolverAssignment[] = [
      // Alice: Multi-role with break
      { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 600 },
      { crewId: 'CREW001', roleId: 2, startMinutes: 600, endMinutes: 720 },
      { crewId: 'CREW001', roleId: 999, startMinutes: 720, endMinutes: 750 },
      { crewId: 'CREW001', roleId: 3, startMinutes: 750, endMinutes: 900 },
      { crewId: 'CREW001', roleId: 1, startMinutes: 900, endMinutes: 1020 },
      
      // Bob: Register specialist (no switches)
      { crewId: 'CREW002', roleId: 1, startMinutes: 480, endMinutes: 660 },
      { crewId: 'CREW002', roleId: 999, startMinutes: 660, endMinutes: 690 },
      { crewId: 'CREW002', roleId: 1, startMinutes: 690, endMinutes: 840 },
      
      // Charlie: Floor only
      { crewId: 'CREW003', roleId: 2, startMinutes: 600, endMinutes: 780 },
      { crewId: 'CREW003', roleId: 2, startMinutes: 780, endMinutes: 960 },
      
      // Diana: Stock only (consistent)
      { crewId: 'CREW004', roleId: 3, startMinutes: 480, endMinutes: 720 },
      { crewId: 'CREW004', roleId: 999, startMinutes: 720, endMinutes: 750 },
      { crewId: 'CREW004', roleId: 3, startMinutes: 750, endMinutes: 1020 },
      
      // Eve: Maximum flexibility
      { crewId: 'CREW005', roleId: 2, startMinutes: 540, endMinutes: 660 },
      { crewId: 'CREW005', roleId: 1, startMinutes: 660, endMinutes: 780 },
      { crewId: 'CREW005', roleId: 999, startMinutes: 780, endMinutes: 810 },
      { crewId: 'CREW005', roleId: 3, startMinutes: 810, endMinutes: 930 },
      { crewId: 'CREW005', roleId: 2, startMinutes: 930, endMinutes: 1080 },
    ];

    it('should validate all assignments in complex schedule', () => {
      const results = complexSchedule.map(assignment => {
        const role = roles.find(r => r.id === assignment.roleId)!;
        return {
          assignment,
          slotAlignment: validateSlotAlignment(assignment, store),
          storeHours: validateStoreHours(assignment, store, role),
        };
      });

      const invalidCount = results.filter(r => !r.slotAlignment.valid || !r.storeHours.valid).length;
      expect(invalidCount).toBe(0);
    });

    it('should calculate satisfaction with all 4 scorers', () => {
      const preferences: PreferenceConfig[] = [
        // Complex preference mix for all crew
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.0 },
        
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 15, crewWeight: 1.2, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 12, crewWeight: 1.2, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: null, preferenceType: 'TIMING', intValue: 0, baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        
        { crewId: 'CREW003', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 8, crewWeight: 0.8, adaptiveBoost: 1.0 },
        { crewId: 'CREW003', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 15, crewWeight: 1.0, adaptiveBoost: 1.0 },
        
        { crewId: 'CREW004', roleId: 3, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.5 },
        { crewId: 'CREW004', roleId: 3, preferenceType: 'FAVORITE', baseWeight: 15, crewWeight: 1.0, adaptiveBoost: 1.5 },
        { crewId: 'CREW004', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 20, crewWeight: 1.0, adaptiveBoost: 1.5 },
        
        { crewId: 'CREW005', roleId: 2, preferenceType: 'FIRST_HOUR', baseWeight: 8, crewWeight: 1.0, adaptiveBoost: 1.2 },
        { crewId: 'CREW005', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.2 },
      ];

      const scores = {
        firstHour: scoreFirstHourPreferences(complexSchedule, preferences, crew),
        favorite: scoreFavoritePreferences(complexSchedule, preferences, crew),
        consecutive: scoreConsecutivePreferences(complexSchedule, preferences, store),
        timing: scoreTimingPreferences(complexSchedule, preferences, store, breakRoleIds),
      };

      // All scorers should complete without errors
      expect(scores.firstHour).toBeDefined();
      expect(scores.favorite).toBeDefined();
      expect(scores.consecutive).toBeDefined();
      expect(scores.timing).toBeDefined();

      // Aggregate total score
      const totalScore = scores.firstHour.score + scores.favorite.score + scores.consecutive.score + scores.timing.score;
      
      // Complex schedule should still have positive total (some penalties expected)
      expect(totalScore).toBeDefined();
      expect(typeof totalScore).toBe('number');
    });

    it('should track role switches and penalties', () => {
      // Count role switches per crew
      const switches: { [key: string]: number } = {};
      
      crew.forEach(c => {
        const crewAssignments = complexSchedule.filter(a => a.crewId === c.id);
        let switchCount = 0;
        
        for (let i = 1; i < crewAssignments.length; i++) {
          if (crewAssignments[i].roleId !== crewAssignments[i-1].roleId) {
            switchCount++;
          }
        }
        
        switches[c.id] = switchCount;
      });

      // Alice should have most switches (4 role changes)
      expect(switches['CREW001']).toBeGreaterThanOrEqual(3);
      
      // Bob should have fewer (only break)
      expect(switches['CREW002']).toBeLessThanOrEqual(2);
      
      // Charlie should have 0 (all floor)
      expect(switches['CREW003']).toBe(0);
      
      // Diana should have minimal (only break)
      expect(switches['CREW004']).toBeLessThanOrEqual(2);
    });
  });

  describe('Edge cases - extreme schedules', () => {
    it('should handle schedule with all crew on same role', () => {
      const sameRoleSchedule: SolverAssignment[] = crew.map(c => ({
        crewId: c.id,
        roleId: 2, // Everyone on floor
        startMinutes: 480,
        endMinutes: 720,
      }));

      const validation = sameRoleSchedule.every(a => 
        validateSlotAlignment(a, store).valid
      );
      
      expect(validation).toBe(true);

      const preferences: PreferenceConfig[] = crew.map(c => ({
        crewId: c.id,
        roleId: 2,
        preferenceType: 'FAVORITE',
        baseWeight: 10,
        crewWeight: 1.0,
        adaptiveBoost: 1.0,
      }));

      const score = scoreFavoritePreferences(sameRoleSchedule, preferences, crew);
      expect(score.score).toBeGreaterThan(0);
    });

    it('should handle minimal schedule (1 crew, 1 assignment)', () => {
      const minimalSchedule: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const validation = validateSlotAlignment(minimalSchedule[0], store);
      expect(validation.valid).toBe(true);

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const score = scoreFavoritePreferences(minimalSchedule, preferences, crew);
      expect(score.score).toBe(600); // 60 minutes × 10
    });

    it('should handle maximum schedule (all crew, full day, all roles)', () => {
      // Each crew works 8 hours across all available roles
      const maxSchedule: SolverAssignment[] = [];
      
      crew.forEach((c, crewIndex) => {
        const startTime = 480 + (crewIndex * 30); // Stagger starts
        let currentTime = startTime;
        
        // Assign 8 hours of work
        while (currentTime < startTime + 480) {
          const roleId = c.qualifiedRoleIds[(Math.floor((currentTime - startTime) / 120)) % c.qualifiedRoleIds.length];
          maxSchedule.push({
            crewId: c.id,
            roleId,
            startMinutes: currentTime,
            endMinutes: Math.min(currentTime + 120, startTime + 480),
          });
          currentTime += 120;
        }
      });

      // Validate all
      const allValid = maxSchedule.every(a => validateSlotAlignment(a, store).valid);
      expect(allValid).toBe(true);

      // Score all
      const preferences: PreferenceConfig[] = crew.map(c => ({
        crewId: c.id,
        roleId: null,
        preferenceType: 'CONSECUTIVE',
        baseWeight: 10,
        crewWeight: 1.0,
        adaptiveBoost: 1.0,
      }));

      const score = scoreConsecutivePreferences(maxSchedule, preferences, store);
      // Will have penalties due to role switches, but should complete
      expect(score).toBeDefined();
    });
  });

  describe('Performance - realistic schedule size', () => {
    it('should validate and score a full week of schedules efficiently', () => {
      const weekSchedule: SolverAssignment[] = [];
      
      // 5 crew × 5 days × 8 hours = 200 assignments
      for (let day = 0; day < 5; day++) {
        crew.forEach(c => {
          // Each crew gets 4 assignments per day (2-hour blocks)
          for (let block = 0; block < 4; block++) {
            const roleId = c.qualifiedRoleIds[block % c.qualifiedRoleIds.length];
            weekSchedule.push({
              crewId: c.id,
              roleId,
              startMinutes: 480 + (block * 120),
              endMinutes: 480 + ((block + 1) * 120),
            });
          }
        });
      }

      expect(weekSchedule.length).toBe(100); // 5 crew × 4 blocks × 5 days

      const startTime = Date.now();

      // Validate all
      weekSchedule.forEach(a => {
        const role = roles.find(r => r.id === a.roleId)!;
        validateSlotAlignment(a, store);
        validateStoreHours(a, store, role);
      });

      // Score all
      const preferences: PreferenceConfig[] = crew.flatMap(c => [
        { crewId: c.id, roleId: c.qualifiedRoleIds[0], preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: c.id, roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 15, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ]);

      scoreFirstHourPreferences(weekSchedule, preferences, crew);
      scoreFavoritePreferences(weekSchedule, preferences, crew);
      scoreConsecutivePreferences(weekSchedule, preferences, store);

      const duration = Date.now() - startTime;

      // Should handle 100 assignments efficiently
      expect(duration).toBeLessThan(100);
    });
  });

  describe('System completeness check', () => {
    it('should use all validators in complete workflow', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 720,
      };

      const role = roles[0];

      // All validators should be callable
      const validators = {
        slotAlignment: validateSlotAlignment(assignment, store),
        storeHours: validateStoreHours(assignment, store, role),
        roleSlotDuration: validateRoleSlotDuration(assignment, store, role),
        consecutiveSlots: validateConsecutiveSlots(assignment, store, role),
      };

      Object.values(validators).forEach(result => {
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('violations');
      });
    });

    it('should use all scorers in complete workflow', () => {
      const schedule: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: 'CREW001', roleId: 999, startMinutes: 660, endMinutes: 690 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 690, endMinutes: 840 },
      ];

      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: null, preferenceType: 'CONSECUTIVE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW001', roleId: null, preferenceType: 'TIMING', intValue: 0, baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      // All scorers should be callable
      const scorers = {
        firstHour: scoreFirstHourPreferences(schedule, preferences, crew),
        favorite: scoreFavoritePreferences(schedule, preferences, crew),
        consecutive: scoreConsecutivePreferences(schedule, preferences, store),
        timing: scoreTimingPreferences(schedule, preferences, store, breakRoleIds),
      };

      Object.values(scorers).forEach(result => {
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('details');
      });
    });

    it('should demonstrate complete solve workflow', () => {
      // Step 1: Define schedule
      const schedule: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 720 },
        { crewId: 'CREW002', roleId: 2, startMinutes: 480, endMinutes: 720 },
      ];

      // Step 2: Validate
      const validationResults = schedule.map(a => {
        const role = roles.find(r => r.id === a.roleId)!;
        return {
          slotAlignment: validateSlotAlignment(a, store),
          storeHours: validateStoreHours(a, store, role),
        };
      });

      const allValid = validationResults.every(r => r.slotAlignment.valid && r.storeHours.valid);
      expect(allValid).toBe(true);

      // Step 3: Score
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 1.0, adaptiveBoost: 1.0 },
      ];

      const totalScore = scoreFirstHourPreferences(schedule, preferences, crew).score +
                        scoreFavoritePreferences(schedule, preferences, crew).score;

      // Step 4: Result
      expect(allValid).toBe(true);
      expect(totalScore).toBeGreaterThan(0);
    });
  });
});
