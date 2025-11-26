/**
 * Integration Test #1: Multi-Validator Integration
 * 
 * Tests multiple constraint validators working together on the same assignments.
 * Ensures validators can be composed and don't interfere with each other.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSlotAlignment,
  validateStoreHours,
  validateRoleSlotDuration,
  validateConsecutiveSlots,
} from '../../src/constraints';

import type {
  SolverAssignment,
  StoreConfig,
  RoleConfig,
} from '../../src/constraints/types';

describe('Integration #1: Multi-Validator', () => {
  const store: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,   // 8:00 AM
    closeMinutesFromMidnight: 1260, // 9:00 PM
    reqShiftLengthForBreak: 360,    // 6 hours
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

  describe('Perfect assignment - all validators pass', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,  // 8:00 AM
      endMinutes: 960,    // 4:00 PM (8 hours)
    };

    it('should pass slot alignment', () => {
      const result = validateSlotAlignment(assignment, store);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass store hours', () => {
      const result = validateStoreHours(assignment, store, registerRole);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass role slot duration', () => {
      const result = validateRoleSlotDuration(assignment, store, registerRole);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass ALL 4 validators together', () => {
      const results = {
        slotAlignment: validateSlotAlignment(assignment, store),
        storeHours: validateStoreHours(assignment, store, registerRole),
        roleSlotDuration: validateRoleSlotDuration(assignment, store, registerRole),
        consecutiveSlots: validateConsecutiveSlots(assignment, store, registerRole),
      };

      // All should be valid
      Object.values(results).forEach(result => {
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      // Total violations across ALL validators should be 0
      const totalViolations = Object.values(results).reduce(
        (sum, r) => sum + r.violations.length,
        0
      );
      expect(totalViolations).toBe(0);
    });
  });

  describe('Misaligned assignment - fails 1 validator, passes others', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 485,  // 8:05 AM - NOT aligned to 30min!
      endMinutes: 965,    // 4:05 PM - NOT aligned!
    };

    it('should FAIL slot alignment', () => {
      const result = validateSlotAlignment(assignment, store);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should PASS store hours (time is fine, just misaligned)', () => {
      const result = validateStoreHours(assignment, store, registerRole);
      expect(result.valid).toBe(true);
    });

    it('should PASS role slot duration', () => {
      const result = validateRoleSlotDuration(assignment, store, registerRole);
      expect(result.valid).toBe(true);
    });

    it('should show exactly ONE failing validator out of 3', () => {
      const results = {
        slotAlignment: validateSlotAlignment(assignment, store),
        storeHours: validateStoreHours(assignment, store, registerRole),
        roleSlotDuration: validateRoleSlotDuration(assignment, store, registerRole),
      };

      const failedCount = Object.values(results).filter(r => !r.valid).length;
      const passedCount = Object.values(results).filter(r => r.valid).length;

      expect(failedCount).toBe(1);
      expect(passedCount).toBe(2);
    });
  });

  describe('Outside store hours - fails 1 validator, passes others', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 420,  // 7:00 AM - before store opens!
      endMinutes: 900,    // 3:00 PM
    };

    it('should PASS slot alignment (properly aligned)', () => {
      const result = validateSlotAlignment(assignment, store);
      expect(result.valid).toBe(true);
    });

    it('should FAIL store hours', () => {
      const result = validateStoreHours(assignment, store, registerRole);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should PASS role slot duration', () => {
      const result = validateRoleSlotDuration(assignment, store, registerRole);
      expect(result.valid).toBe(true);
    });

    it('should identify which validator failed', () => {
      const slotCheck = validateSlotAlignment(assignment, store);
      const hoursCheck = validateStoreHours(assignment, store, registerRole);
      const durationCheck = validateRoleSlotDuration(assignment, store, registerRole);

      expect(slotCheck.valid).toBe(true); // Slot alignment should pass
      expect(hoursCheck.valid).toBe(false); // Store hours should fail
      expect(durationCheck.valid).toBe(true); // Duration should pass
    });
  });

  describe('Multiple failures - identify all failing validators', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 425,  // 7:05 AM - misaligned AND before open!
      endMinutes: 1325,   // 10:05 PM - misaligned AND after close!
    };

    it('should FAIL slot alignment', () => {
      const result = validateSlotAlignment(assignment, store);
      expect(result.valid).toBe(false);
    });

    it('should FAIL store hours', () => {
      const result = validateStoreHours(assignment, store, registerRole);
      expect(result.valid).toBe(false);
    });

    it('should show TWO failing validators', () => {
      const results = {
        slotAlignment: validateSlotAlignment(assignment, store),
        storeHours: validateStoreHours(assignment, store, registerRole),
      };

      const failedCount = Object.values(results).filter(r => !r.valid).length;
      expect(failedCount).toBe(2);
      
      const totalViolations = Object.values(results).reduce(
        (sum, r) => sum + r.violations.length,
        0
      );
      expect(totalViolations).toBeGreaterThan(2);
    });
  });

  describe('Too short assignment - duration validator fails', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 510, // Only 30 minutes (1 slot) - below minSlots of 2!
    };

    it('should PASS time-based validators', () => {
      const slotCheck = validateSlotAlignment(assignment, store);
      const hoursCheck = validateStoreHours(assignment, store, registerRole);

      expect(slotCheck.valid).toBe(true);
      expect(hoursCheck.valid).toBe(true);
    });

    it('should FAIL role slot duration (too short)', () => {
      const result = validateRoleSlotDuration(assignment, store, registerRole);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('minimum');
    });
  });

  describe('Too long assignment - duration validator fails', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 990, // 510 minutes (17 slots) - above maxSlots of 16!
    };

    it('should PASS time-based validators', () => {
      const slotCheck = validateSlotAlignment(assignment, store);
      const hoursCheck = validateStoreHours(assignment, store, registerRole);

      expect(slotCheck.valid).toBe(true);
      expect(hoursCheck.valid).toBe(true);
    });

    it('should FAIL role slot duration (too long)', () => {
      const result = validateRoleSlotDuration(assignment, store, registerRole);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('maximum');
    });
  });

  describe('Consecutive slots requirement', () => {
    const consecutiveRole: RoleConfig = {
      id: 1,
      code: 'REGISTER',
      minSlots: 2,
      maxSlots: 16,
      blockSize: 1,
      slotsMustBeConsecutive: true, // Must be consecutive
      allowOutsideStoreHours: false,
    };

    const nonConsecutiveRole: RoleConfig = {
      id: 3,
      code: 'ORDER_WRITER',
      minSlots: 2,
      maxSlots: 6,
      blockSize: 1,
      slotsMustBeConsecutive: false, // Can be split!
      allowOutsideStoreHours: false,
    };

    const singleAssignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,
      endMinutes: 960,
    };

    it('should PASS consecutive validator for single assignment (always consecutive)', () => {
      const result = validateConsecutiveSlots(singleAssignment, store, consecutiveRole);
      expect(result.valid).toBe(true);
    });

    it('should PASS for role that allows non-consecutive', () => {
      const result = validateConsecutiveSlots(singleAssignment, store, nonConsecutiveRole);
      expect(result.valid).toBe(true);
    });

    it('should work with other validators', () => {
      const results = {
        slotAlignment: validateSlotAlignment(singleAssignment, store),
        storeHours: validateStoreHours(singleAssignment, store, consecutiveRole),
        roleSlotDuration: validateRoleSlotDuration(singleAssignment, store, consecutiveRole),
        consecutiveSlots: validateConsecutiveSlots(singleAssignment, store, consecutiveRole),
      };

      // All should pass
      Object.values(results).forEach(result => {
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Real-world scenario: 8-hour shift with perfect alignment', () => {
    const assignment: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,  // 8:00 AM (store opens)
      endMinutes: 960,    // 4:00 PM (before close)
    };

    it('should pass all 4 core validators', () => {
      const results = {
        slotAlignment: validateSlotAlignment(assignment, store),
        storeHours: validateStoreHours(assignment, store, registerRole),
        roleSlotDuration: validateRoleSlotDuration(assignment, store, registerRole),
        consecutiveSlots: validateConsecutiveSlots(assignment, store, registerRole),
      };

      // Verify each validator
      expect(results.slotAlignment.valid).toBe(true);
      expect(results.storeHours.valid).toBe(true);
      expect(results.roleSlotDuration.valid).toBe(true);
      expect(results.consecutiveSlots.valid).toBe(true);

      // No violations anywhere
      Object.values(results).forEach(result => {
        expect(result.violations).toHaveLength(0);
      });
    });
  });

  describe('Edge case: Opening shift', () => {
    const openingShift: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 480,  // Exactly when store opens
      endMinutes: 720,    // 4 hours
    };

    it('should pass all validators for opening shift', () => {
      const results = {
        slotAlignment: validateSlotAlignment(openingShift, store),
        storeHours: validateStoreHours(openingShift, store, registerRole),
        roleSlotDuration: validateRoleSlotDuration(openingShift, store, registerRole),
      };

      Object.values(results).forEach(result => {
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Edge case: Closing shift', () => {
    const closingShift: SolverAssignment = {
      crewId: 'CREW001',
      roleId: 1,
      startMinutes: 780,  // 1:00 PM
      endMinutes: 1260,   // Exactly when store closes
    };

    it('should pass all validators for closing shift', () => {
      const results = {
        slotAlignment: validateSlotAlignment(closingShift, store),
        storeHours: validateStoreHours(closingShift, store, registerRole),
        roleSlotDuration: validateRoleSlotDuration(closingShift, store, registerRole),
      };

      Object.values(results).forEach(result => {
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Performance: Multiple validators on many assignments', () => {
    it('should handle 100 assignments efficiently', () => {
      const assignments: SolverAssignment[] = [];
      
      // Create 100 valid assignments
      for (let i = 0; i < 100; i++) {
        assignments.push({
          crewId: `CREW${String(i).padStart(3, '0')}`,
          roleId: 1,
          startMinutes: 480,
          endMinutes: 960,
        });
      }

      const startTime = Date.now();
      
      // Run all 4 validators on all assignments
      assignments.forEach(assignment => {
        validateSlotAlignment(assignment, store);
        validateStoreHours(assignment, store, registerRole);
        validateRoleSlotDuration(assignment, store, registerRole);
        validateConsecutiveSlots(assignment, store, registerRole);
      });

      const duration = Date.now() - startTime;
      
      // Should complete quickly (< 100ms for 400 validations)
      expect(duration).toBeLessThan(100);
    });
  });
});
