import { describe, it, expect } from 'vitest';
import {
  validateStoreHours,
  formatMinutesToTime,
  isWithinStoreHours,
} from '../../src/constraints/validators/storeHours';
import type { SolverAssignment, StoreConfig, RoleConfig } from '../../src/constraints/types';

describe('Store Hours Validator', () => {
  const store: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,  // 8:00 AM
    closeMinutesFromMidnight: 1260, // 9:00 PM
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270,
  };

  const regularRole: RoleConfig = {
    id: 1,
    code: 'REGISTER',
    minSlots: 2,
    maxSlots: 16,
    blockSize: 1,
    slotsMustBeConsecutive: true,
    allowOutsideStoreHours: false, // MUST stay within store hours
  };

  const setupRole: RoleConfig = {
    id: 2,
    code: 'SETUP',
    minSlots: 2,
    maxSlots: 8,
    blockSize: 1,
    slotsMustBeConsecutive: true,
    allowOutsideStoreHours: true, // CAN go outside store hours
  };

  describe('validateStoreHours', () => {
    describe('Regular roles (allowOutsideStoreHours = false)', () => {
      it('should pass for shift entirely within store hours', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: regularRole.id,
          startMinutes: 480,  // 8:00 AM (store opens)
          endMinutes: 960,    // 4:00 PM (before close)
        };

        const result = validateStoreHours(assignment, store, regularRole);
        
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should pass for shift at exact store boundaries', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: regularRole.id,
          startMinutes: 480,  // 8:00 AM (exactly when store opens)
          endMinutes: 1260,   // 9:00 PM (exactly when store closes)
        };

        const result = validateStoreHours(assignment, store, regularRole);
        
        expect(result.valid).toBe(true);
      });

      it('should fail when shift starts before store opens', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: regularRole.id,
          startMinutes: 420,  // 7:00 AM (before 8:00 AM open)
          endMinutes: 900,    // 3:00 PM
        };

        const result = validateStoreHours(assignment, store, regularRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('7:00 AM');
        expect(result.violations[0]).toContain('8:00 AM');
        expect(result.violations[0]).toContain('before store opens');
        expect(result.violations[0]).toContain('REGISTER');
      });

      it('should fail when shift ends after store closes', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: regularRole.id,
          startMinutes: 1080,  // 6:00 PM
          endMinutes: 1320,    // 10:00 PM (after 9:00 PM close)
        };

        const result = validateStoreHours(assignment, store, regularRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('10:00 PM');
        expect(result.violations[0]).toContain('9:00 PM');
        expect(result.violations[0]).toContain('after store closes');
      });

      it('should fail when shift both starts early and ends late', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: regularRole.id,
          startMinutes: 420,  // 7:00 AM (before open)
          endMinutes: 1320,   // 10:00 PM (after close)
        };

        const result = validateStoreHours(assignment, store, regularRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(2); // Both violations
        expect(result.violations[0]).toContain('before store opens');
        expect(result.violations[1]).toContain('after store closes');
      });

      it('should fail for early morning shift (6 AM - 2 PM)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: regularRole.id,
          startMinutes: 360,  // 6:00 AM
          endMinutes: 840,    // 2:00 PM
        };

        const result = validateStoreHours(assignment, store, regularRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations[0]).toContain('6:00 AM');
      });

      it('should fail for late night shift (5 PM - 11 PM)', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: regularRole.id,
          startMinutes: 1020,  // 5:00 PM
          endMinutes: 1380,    // 11:00 PM
        };

        const result = validateStoreHours(assignment, store, regularRole);
        
        expect(result.valid).toBe(false);
        expect(result.violations[0]).toContain('11:00 PM');
      });
    });

    describe('Special roles (allowOutsideStoreHours = true)', () => {
      it('should pass for shift starting before store opens', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: setupRole.id,
          startMinutes: 420,  // 7:00 AM (before 8:00 AM open)
          endMinutes: 900,    // 3:00 PM
        };

        const result = validateStoreHours(assignment, store, setupRole);
        
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should pass for shift ending after store closes', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: setupRole.id,
          startMinutes: 1080,  // 6:00 PM
          endMinutes: 1320,    // 10:00 PM (after 9:00 PM close)
        };

        const result = validateStoreHours(assignment, store, setupRole);
        
        expect(result.valid).toBe(true);
      });

      it('should pass for shift completely outside store hours', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: setupRole.id,
          startMinutes: 300,  // 5:00 AM
          endMinutes: 420,    // 7:00 AM (before store opens)
        };

        const result = validateStoreHours(assignment, store, setupRole);
        
        expect(result.valid).toBe(true);
      });

      it('should pass for overnight shift', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: setupRole.id,
          startMinutes: 1320,  // 10:00 PM
          endMinutes: 1440,    // Midnight
        };

        const result = validateStoreHours(assignment, store, setupRole);
        
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('formatMinutesToTime', () => {
      it('should format morning times correctly', () => {
        expect(formatMinutesToTime(0)).toBe('12:00 AM');    // Midnight
        expect(formatMinutesToTime(60)).toBe('1:00 AM');
        expect(formatMinutesToTime(360)).toBe('6:00 AM');
        expect(formatMinutesToTime(480)).toBe('8:00 AM');
        expect(formatMinutesToTime(690)).toBe('11:30 AM');
      });

      it('should format noon correctly', () => {
        expect(formatMinutesToTime(720)).toBe('12:00 PM');
      });

      it('should format afternoon/evening times correctly', () => {
        expect(formatMinutesToTime(780)).toBe('1:00 PM');
        expect(formatMinutesToTime(960)).toBe('4:00 PM');
        expect(formatMinutesToTime(1080)).toBe('6:00 PM');
        expect(formatMinutesToTime(1260)).toBe('9:00 PM');
        expect(formatMinutesToTime(1380)).toBe('11:00 PM');
      });

      it('should handle minutes correctly', () => {
        expect(formatMinutesToTime(485)).toBe('8:05 AM');
        expect(formatMinutesToTime(510)).toBe('8:30 AM');
        expect(formatMinutesToTime(1275)).toBe('9:15 PM');
      });
    });

    describe('isWithinStoreHours', () => {
      it('should return true for assignment within hours', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 960,
        };

        expect(isWithinStoreHours(assignment, store)).toBe(true);
      });

      it('should return true for assignment at exact boundaries', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 1260,
        };

        expect(isWithinStoreHours(assignment, store)).toBe(true);
      });

      it('should return false if starts before open', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 420,
          endMinutes: 900,
        };

        expect(isWithinStoreHours(assignment, store)).toBe(false);
      });

      it('should return false if ends after close', () => {
        const assignment: SolverAssignment = {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 1080,
          endMinutes: 1320,
        };

        expect(isWithinStoreHours(assignment, store)).toBe(false);
      });
    });
  });
});
