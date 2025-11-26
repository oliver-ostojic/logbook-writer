import { describe, it, expect } from 'vitest';
import {
  validateRoleSlotDuration,
  isWithinSlotBounds,
  getAllowedDurationRange,
} from '../../src/constraints/validators/roleSlotDuration';
import type { SolverAssignment, StoreConfig, RoleConfig } from '../../src/constraints/types';

describe('Role Slot Duration Validator', () => {
  const store: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,
    closeMinutesFromMidnight: 1260,
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270,
  };

  // Register: 1-8 hour shifts (2-16 slots with 30min slots)
  const registerRole: RoleConfig = {
    id: 1,
    code: 'REGISTER',
    minSlots: 2,   // 1 hour minimum
    maxSlots: 16,  // 8 hours maximum
    blockSize: 1,  // any slot count allowed
    slotsMustBeConsecutive: true,
    allowOutsideStoreHours: false,
  };

  // Order Writer: 1-2 hour shifts (2-4 slots)
  const orderWriterRole: RoleConfig = {
    id: 2,
    code: 'ORDER_WRITER',
    minSlots: 2,  // 1 hour minimum
    maxSlots: 4,  // 2 hours maximum
    blockSize: 1, // any slot count allowed
    slotsMustBeConsecutive: true,
    allowOutsideStoreHours: false,
  };

  // Demo: 4-8 hour shifts (8-16 slots)
  const demoRole: RoleConfig = {
    id: 3,
    code: 'DEMO',
    minSlots: 8,   // 4 hours minimum
    maxSlots: 16,  // 8 hours maximum
    blockSize: 1,  // any slot count allowed
    slotsMustBeConsecutive: true,
    allowOutsideStoreHours: false,
  };

  describe('validateRoleSlotDuration', () => {
    describe('Register role (1-8 hour shifts)', () => {
      it('should pass for 4-hour shift (within bounds)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 720,    // 12:00 PM (4 hours = 8 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerRole);
        
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should pass for minimum 1-hour shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 540,    // 9:00 AM (1 hour = 2 slots, exactly at min)
        };

        const result = validateRoleSlotDuration(assignment, store, registerRole);
        
        expect(result.valid).toBe(true);
      });

      it('should pass for maximum 8-hour shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 960,    // 4:00 PM (8 hours = 16 slots, exactly at max)
        };

        const result = validateRoleSlotDuration(assignment, store, registerRole);
        
        expect(result.valid).toBe(true);
      });

      it('should fail for too short shift (30 minutes)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 510,    // 8:30 AM (0.5 hours = 1 slot, below min of 2)
        };

        const result = validateRoleSlotDuration(assignment, store, registerRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('0.5 hr(s)');
        expect(result.violations[0]).toContain('1 slots');
        expect(result.violations[0]).toContain('minimum 1 hr(s)');
        expect(result.violations[0]).toContain('2 slots');
        expect(result.violations[0]).toContain('REGISTER');
      });

      it('should fail for too long shift (9 hours)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 1020,   // 5:00 PM (9 hours = 18 slots, above max of 16)
        };

        const result = validateRoleSlotDuration(assignment, store, registerRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('9 hr(s)');
        expect(result.violations[0]).toContain('18 slots');
        expect(result.violations[0]).toContain('maximum 8 hr(s)');
        expect(result.violations[0]).toContain('16 slots');
      });
    });

    describe('Order Writer role (1-2 hour shifts)', () => {
      it('should pass for 1-hour shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: orderWriterRole.id,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 660,    // 11:00 AM (1 hour = 2 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, orderWriterRole);
        
        expect(result.valid).toBe(true);
      });

      it('should pass for 1.5-hour shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: orderWriterRole.id,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 690,    // 11:30 AM (1.5 hours = 3 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, orderWriterRole);
        
        expect(result.valid).toBe(true);
      });

      it('should pass for maximum 2-hour shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: orderWriterRole.id,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 720,    // 12:00 PM (2 hours = 4 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, orderWriterRole);
        
        expect(result.valid).toBe(true);
      });

      it('should fail for 3-hour shift (too long)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: orderWriterRole.id,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 780,    // 1:00 PM (3 hours = 6 slots, above max of 4)
        };

        const result = validateRoleSlotDuration(assignment, store, orderWriterRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations[0]).toContain('3 hr(s)');
        expect(result.violations[0]).toContain('ORDER_WRITER');
      });
    });

    describe('Demo role (4-8 hour shifts)', () => {
      it('should pass for 6-hour shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: demoRole.id,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 960,    // 4:00 PM (6 hours = 12 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, demoRole);
        
        expect(result.valid).toBe(true);
      });

      it('should pass for minimum 4-hour shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: demoRole.id,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 840,    // 2:00 PM (4 hours = 8 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, demoRole);
        
        expect(result.valid).toBe(true);
      });

      it('should fail for 3-hour shift (too short)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: demoRole.id,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 780,    // 1:00 PM (3 hours = 6 slots, below min of 8)
        };

        const result = validateRoleSlotDuration(assignment, store, demoRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations[0]).toContain('3 hr(s)');
        expect(result.violations[0]).toContain('minimum 4 hr(s)');
        expect(result.violations[0]).toContain('DEMO');
      });
    });

    describe('Different slot sizes', () => {
      it('should work with 15-minute slots', () => {
        const store15min: StoreConfig = {
          ...store,
          baseSlotMinutes: 15,
        };

        const role15min: RoleConfig = {
          ...registerRole,
          minSlots: 4,  // 1 hour minimum (4 x 15min)
          maxSlots: 32, // 8 hours maximum (32 x 15min)
        };

        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: role15min.id,
          startMinutes: 480,
          endMinutes: 540,  // 1 hour = 4 slots of 15min
        };

        const result = validateRoleSlotDuration(assignment, store15min, role15min);
        expect(result.valid).toBe(true);
      });

      it('should work with 60-minute slots', () => {
        const store60min: StoreConfig = {
          ...store,
          baseSlotMinutes: 60,
        };

        const role60min: RoleConfig = {
          ...registerRole,
          minSlots: 1,  // 1 hour minimum
          maxSlots: 8,  // 8 hours maximum
        };

        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: role60min.id,
          startMinutes: 480,
          endMinutes: 720,  // 4 hours = 4 slots of 60min
        };

        const result = validateRoleSlotDuration(assignment, store60min, role60min);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('isWithinSlotBounds', () => {
      it('should return true for assignment within bounds', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,
          endMinutes: 720,  // 4 hours = 8 slots (within 2-16)
        };

        expect(isWithinSlotBounds(assignment, store, registerRole)).toBe(true);
      });

      it('should return false for too short assignment', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,
          endMinutes: 510,  // 0.5 hours = 1 slot (below min of 2)
        };

        expect(isWithinSlotBounds(assignment, store, registerRole)).toBe(false);
      });

      it('should return false for too long assignment', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: registerRole.id,
          startMinutes: 480,
          endMinutes: 1020,  // 9 hours = 18 slots (above max of 16)
        };

        expect(isWithinSlotBounds(assignment, store, registerRole)).toBe(false);
      });
    });

    describe('getAllowedDurationRange', () => {
      it('should return correct range for register role', () => {
        const range = getAllowedDurationRange(store, registerRole);
        
        expect(range.minHours).toBe(1);
        expect(range.maxHours).toBe(8);
        expect(range.minSlots).toBe(2);
        expect(range.maxSlots).toBe(16);
      });

      it('should return correct range for order writer role', () => {
        const range = getAllowedDurationRange(store, orderWriterRole);
        
        expect(range.minHours).toBe(1);
        expect(range.maxHours).toBe(2);
        expect(range.minSlots).toBe(2);
        expect(range.maxSlots).toBe(4);
      });

      it('should return correct range for demo role', () => {
        const range = getAllowedDurationRange(store, demoRole);
        
        expect(range.minHours).toBe(4);
        expect(range.maxHours).toBe(8);
        expect(range.minSlots).toBe(8);
        expect(range.maxSlots).toBe(16);
      });
    });
  });

  describe('Block Size Enforcement', () => {
    // Register with blockSize=2 (must assign in 1-hour increments only)
    const registerBlockSize2: RoleConfig = {
      id: 10,
      code: 'REGISTER',
      minSlots: 2,   // 1 hour minimum
      maxSlots: 16,  // 8 hours maximum
      blockSize: 2,  // must be in 2-slot (1 hour) increments
      slotsMustBeConsecutive: true,
      allowOutsideStoreHours: false,
    };

    describe('with blockSize=2 (1 hour increments)', () => {
      it('should pass for 2 slots (1 hour) - valid block size', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 10,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM (2 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerBlockSize2);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should pass for 4 slots (2 hours) - valid block size', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 10,
          startMinutes: 540, // 9:00 AM
          endMinutes: 660,   // 11:00 AM (4 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerBlockSize2);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should pass for 6 slots (3 hours) - valid block size', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 10,
          startMinutes: 540, // 9:00 AM
          endMinutes: 720,   // 12:00 PM (6 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerBlockSize2);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should FAIL for 3 slots (1.5 hours) - not multiple of blockSize', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 10,
          startMinutes: 540, // 9:00 AM
          endMinutes: 630,   // 10:30 AM (3 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerBlockSize2);
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('blocks of 2 slots');
        expect(result.violations[0]).toContain('3 slots');
      });

      it('should FAIL for 5 slots (2.5 hours) - not multiple of blockSize', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 10,
          startMinutes: 540, // 9:00 AM
          endMinutes: 690,   // 11:30 AM (5 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerBlockSize2);
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('blocks of 2 slots');
        expect(result.violations[0]).toContain('1 hr increments');
      });

      it('should FAIL for 7 slots (3.5 hours) - not multiple of blockSize', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 10,
          startMinutes: 540, // 9:00 AM
          endMinutes: 750,   // 12:30 PM (7 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerBlockSize2);
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('blocks of 2 slots');
      });

      it('should pass for 16 slots (8 hours) - valid block size at max', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 10,
          startMinutes: 540,  // 9:00 AM
          endMinutes: 1020,   // 5:00 PM (16 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerBlockSize2);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    });

    describe('with blockSize=4 (2 hour increments)', () => {
      const roleBlockSize4: RoleConfig = {
        id: 11,
        code: 'SPECIAL_ROLE',
        minSlots: 4,   // 2 hour minimum
        maxSlots: 16,  // 8 hours maximum
        blockSize: 4,  // must be in 4-slot (2 hour) increments
        slotsMustBeConsecutive: true,
        allowOutsideStoreHours: false,
      };

      it('should pass for 4 slots (2 hours)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 11,
          startMinutes: 540, // 9:00 AM
          endMinutes: 660,   // 11:00 AM (4 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, roleBlockSize4);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should pass for 8 slots (4 hours)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 11,
          startMinutes: 540, // 9:00 AM
          endMinutes: 780,   // 1:00 PM (8 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, roleBlockSize4);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should FAIL for 6 slots (3 hours) - not multiple of 4', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 11,
          startMinutes: 540, // 9:00 AM
          endMinutes: 720,   // 12:00 PM (6 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, roleBlockSize4);
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('blocks of 4 slots');
        expect(result.violations[0]).toContain('2 hr increments');
      });
    });

    describe('with blockSize=1 (default - any slot count allowed)', () => {
      it('should allow any slot count between min and max', () => {
        const assignment3slots: SolverAssignment = {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 630,   // 10:30 AM (3 slots)
        };

        const result = validateRoleSlotDuration(assignment3slots, store, registerRole);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should allow 5 slots (2.5 hours)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 690,   // 11:30 AM (5 slots)
        };

        const result = validateRoleSlotDuration(assignment, store, registerRole);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    });
  });
});
