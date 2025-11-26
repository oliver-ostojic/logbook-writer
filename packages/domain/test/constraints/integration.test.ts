/**
 * Integration test demonstrating how to use constraint validators
 * 
 * This file shows the pattern for testing constraints with real-world scenarios.
 * Each constraint is tested independently before being integrated into the solver.
 */

import { describe, it, expect } from 'vitest';
import { validateSlotAlignment, validateStoreHours } from '../../src/constraints';
import type { SolverAssignment, StoreConfig, RoleConfig } from '../../src/constraints/types';

describe('Constraint Integration Tests', () => {
  // Realistic store configuration based on your schema
  const costcoStore: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,  // 8:00 AM
    closeMinutesFromMidnight: 1260, // 9:00 PM (21:00)
    reqShiftLengthForBreak: 360,    // 6 hours
    breakWindowStart: 180,          // 3 hours after start
    breakWindowEnd: 270,            // 4.5 hours after start
  };

  describe('Real-world scenario: Register shift', () => {
    it('should validate a typical 4-hour register shift', () => {
      const registerShift: SolverAssignment = {
        crewId: '1234567',
        roleId: 1, // REGISTER
        startMinutes: 480,  // 8:00 AM
        endMinutes: 720,    // 12:00 PM (4 hours)
      };

      const result = validateSlotAlignment(registerShift, costcoStore);
      
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should validate an 8-hour register shift with proper alignment', () => {
      const registerShift: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 480,  // 8:00 AM
        endMinutes: 960,    // 4:00 PM (8 hours)
      };

      const result = validateSlotAlignment(registerShift, costcoStore);
      
      expect(result.valid).toBe(true);
    });

    it('should reject shift with improper time alignment', () => {
      const badShift: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 485,  // 8:05 AM - NOT aligned!
        endMinutes: 725,    // 12:05 PM - NOT aligned!
      };

      const result = validateSlotAlignment(badShift, costcoStore);
      
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Real-world scenario: Demo shift', () => {
    it('should validate a 6-hour demo shift', () => {
      const demoShift: SolverAssignment = {
        crewId: '7654321',
        roleId: 2, // DEMO
        startMinutes: 600,  // 10:00 AM
        endMinutes: 960,    // 4:00 PM (6 hours)
      };

      const result = validateSlotAlignment(demoShift, costcoStore);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Real-world scenario: Order writer (1 hour)', () => {
    it('should validate a short 1-hour order writing shift', () => {
      const orderWriterShift: SolverAssignment = {
        crewId: '9876543',
        roleId: 3, // ORDER_WRITER
        startMinutes: 600,  // 10:00 AM
        endMinutes: 660,    // 11:00 AM (1 hour)
      };

      const result = validateSlotAlignment(orderWriterShift, costcoStore);
      
      expect(result.valid).toBe(true);
    });

    it('should validate a 1.5-hour order writing shift', () => {
      const orderWriterShift: SolverAssignment = {
        crewId: '9876543',
        roleId: 3,
        startMinutes: 600,  // 10:00 AM
        endMinutes: 690,    // 11:30 AM (1.5 hours)
      };

      const result = validateSlotAlignment(orderWriterShift, costcoStore);
      
      expect(result.valid).toBe(true);
    });
  });
});

describe('Multi-constraint validation (combining validators)', () => {
  const costcoStore: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,  // 8:00 AM
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

  const setupRole: RoleConfig = {
    id: 2,
    code: 'SETUP',
    minSlots: 2,
    maxSlots: 8,
    blockSize: 1,
    slotsMustBeConsecutive: true,
    allowOutsideStoreHours: true,
  };

  describe('Valid shifts passing all constraints', () => {
    it('should validate a perfect 8-hour register shift', () => {
      const shift: SolverAssignment = {
        crewId: '1234567',
        roleId: registerRole.id,
        startMinutes: 480,  // 8:00 AM (store opens, aligned)
        endMinutes: 960,    // 4:00 PM (before close, aligned)
      };

      // Check all constraints
      const slotCheck = validateSlotAlignment(shift, costcoStore);
      const hoursCheck = validateStoreHours(shift, costcoStore, registerRole);

      expect(slotCheck.valid).toBe(true);
      expect(hoursCheck.valid).toBe(true);
    });

    it('should validate a closing shift for register', () => {
      const shift: SolverAssignment = {
        crewId: '1234567',
        roleId: registerRole.id,
        startMinutes: 780,  // 1:00 PM (aligned)
        endMinutes: 1260,   // 9:00 PM (store close, aligned)
      };

      const slotCheck = validateSlotAlignment(shift, costcoStore);
      const hoursCheck = validateStoreHours(shift, costcoStore, registerRole);

      expect(slotCheck.valid).toBe(true);
      expect(hoursCheck.valid).toBe(true);
    });
  });

  describe('Invalid shifts failing constraints', () => {
    it('should reject shift with bad alignment but valid hours', () => {
      const shift: SolverAssignment = {
        crewId: '1234567',
        roleId: registerRole.id,
        startMinutes: 485,  // 8:05 AM (NOT aligned to 30min slots!)
        endMinutes: 965,    // 4:05 PM (NOT aligned!)
      };

      const slotCheck = validateSlotAlignment(shift, costcoStore);
      const hoursCheck = validateStoreHours(shift, costcoStore, registerRole);

      expect(slotCheck.valid).toBe(false);
      expect(hoursCheck.valid).toBe(true); // Hours are fine, alignment is not
    });

    it('should reject shift with good alignment but outside hours', () => {
      const shift: SolverAssignment = {
        crewId: '1234567',
        roleId: registerRole.id,
        startMinutes: 420,  // 7:00 AM (aligned but before store opens!)
        endMinutes: 900,    // 3:00 PM (aligned)
      };

      const slotCheck = validateSlotAlignment(shift, costcoStore);
      const hoursCheck = validateStoreHours(shift, costcoStore, registerRole);

      expect(slotCheck.valid).toBe(true); // Alignment is fine
      expect(hoursCheck.valid).toBe(false); // Hours are not
    });

    it('should reject shift failing both constraints', () => {
      const shift: SolverAssignment = {
        crewId: '1234567',
        roleId: registerRole.id,
        startMinutes: 425,  // 7:05 AM (misaligned AND before open!)
        endMinutes: 1325,   // 10:05 PM (misaligned AND after close!)
      };

      const slotCheck = validateSlotAlignment(shift, costcoStore);
      const hoursCheck = validateStoreHours(shift, costcoStore, registerRole);

      expect(slotCheck.valid).toBe(false);
      expect(hoursCheck.valid).toBe(false);
      expect(slotCheck.violations.length).toBeGreaterThan(0);
      expect(hoursCheck.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Setup role with allowOutsideStoreHours', () => {
    it('should allow early setup shift that is properly aligned', () => {
      const shift: SolverAssignment = {
        crewId: '7654321',
        roleId: setupRole.id,
        startMinutes: 420,  // 7:00 AM (before store open, but aligned)
        endMinutes: 660,    // 11:00 AM (aligned)
      };

      const slotCheck = validateSlotAlignment(shift, costcoStore);
      const hoursCheck = validateStoreHours(shift, costcoStore, setupRole);

      expect(slotCheck.valid).toBe(true);
      expect(hoursCheck.valid).toBe(true); // Allowed for setup role
    });

    it('should reject setup shift with bad alignment even though outside hours is allowed', () => {
      const shift: SolverAssignment = {
        crewId: '7654321',
        roleId: setupRole.id,
        startMinutes: 425,  // 7:05 AM (NOT aligned!)
        endMinutes: 665,    // 11:05 AM (NOT aligned!)
      };

      const slotCheck = validateSlotAlignment(shift, costcoStore);
      const hoursCheck = validateStoreHours(shift, costcoStore, setupRole);

      expect(slotCheck.valid).toBe(false); // Still needs proper alignment
      expect(hoursCheck.valid).toBe(true);  // Hours are OK for setup
    });
  });
});
