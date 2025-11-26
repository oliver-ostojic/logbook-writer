import { describe, it, expect } from 'vitest';
import {
  validateSlotAlignment,
  minutesToSlotIndex,
  slotIndexToMinutes,
  calculateSlotsForAssignment,
} from '../../src/constraints/validators/slotAlignment';
import type { SolverAssignment, StoreConfig } from '../../src/constraints/types';

describe('Slot Alignment Validator', () => {
  const store: StoreConfig = {
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480, // 8:00 AM
    closeMinutesFromMidnight: 1260, // 9:00 PM
    reqShiftLengthForBreak: 360,
    breakWindowStart: 180,
    breakWindowEnd: 270,
  };

  describe('validateSlotAlignment', () => {
    it('should pass for assignment aligned to 30-minute slots', () => {
      const assignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 480, // 8:00 AM (exactly on slot boundary)
        endMinutes: 540,   // 9:00 AM (exactly on slot boundary)
      };

      const result = validateSlotAlignment(assignment, store);
      
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass for assignment at half-hour boundaries', () => {
      const assignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 510, // 8:30 AM
        endMinutes: 600,   // 10:00 AM
      };

      const result = validateSlotAlignment(assignment, store);
      
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when start time is not aligned', () => {
      const assignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 485, // 8:05 AM (NOT on slot boundary)
        endMinutes: 540,   // 9:00 AM
      };

      const result = validateSlotAlignment(assignment, store);
      
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Start time 485');
      expect(result.violations[0]).toContain('30-minute slot boundary');
    });

    it('should fail when end time is not aligned', () => {
      const assignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 480, // 8:00 AM
        endMinutes: 545,   // 9:05 AM (NOT on slot boundary)
      };

      const result = validateSlotAlignment(assignment, store);
      
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('End time 545');
    });

    it('should fail when both start and end are misaligned', () => {
      const assignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 485, // 8:05 AM
        endMinutes: 550,   // 9:10 AM
      };

      const result = validateSlotAlignment(assignment, store);
      
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should work with different slot sizes (15 minutes)', () => {
      const store15min: StoreConfig = {
        ...store,
        baseSlotMinutes: 15,
      };

      const validAssignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 495, // 8:15 AM (valid for 15-min slots)
        endMinutes: 525,   // 8:45 AM
      };

      const result = validateSlotAlignment(validAssignment, store15min);
      expect(result.valid).toBe(true);
    });

    it('should work with different slot sizes (60 minutes)', () => {
      const store60min: StoreConfig = {
        ...store,
        baseSlotMinutes: 60,
      };

      const invalidAssignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 510, // 8:30 AM (NOT valid for 60-min slots)
        endMinutes: 600,   // 10:00 AM
      };

      const result = validateSlotAlignment(invalidAssignment, store60min);
      expect(result.valid).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    it('minutesToSlotIndex should convert correctly', () => {
      expect(minutesToSlotIndex(480, 30)).toBe(16); // 8:00 AM = slot 16
      expect(minutesToSlotIndex(510, 30)).toBe(17); // 8:30 AM = slot 17
      expect(minutesToSlotIndex(0, 30)).toBe(0);    // midnight = slot 0
      expect(minutesToSlotIndex(1260, 30)).toBe(42); // 9:00 PM = slot 42
    });

    it('slotIndexToMinutes should convert correctly', () => {
      expect(slotIndexToMinutes(16, 30)).toBe(480);  // slot 16 = 8:00 AM
      expect(slotIndexToMinutes(17, 30)).toBe(510);  // slot 17 = 8:30 AM
      expect(slotIndexToMinutes(0, 30)).toBe(0);     // slot 0 = midnight
      expect(slotIndexToMinutes(42, 30)).toBe(1260); // slot 42 = 9:00 PM
    });

    it('calculateSlotsForAssignment should return correct slot count', () => {
      const assignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 480, // 8:00 AM
        endMinutes: 540,   // 9:00 AM
      };

      expect(calculateSlotsForAssignment(assignment, 30)).toBe(2); // 2 slots = 1 hour
    });

    it('calculateSlotsForAssignment for longer shift', () => {
      const assignment: SolverAssignment = {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 480, // 8:00 AM
        endMinutes: 720,   // 12:00 PM
      };

      expect(calculateSlotsForAssignment(assignment, 30)).toBe(8); // 8 slots = 4 hours
    });
  });
});
