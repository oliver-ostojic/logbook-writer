import { describe, it, expect } from 'vitest';
import {
  validateBreakPolicy,
  shiftRequiresBreak,
  getBreakWindow,
  isBreakTimeValid,
  type BreakPolicyConfig,
  type ShiftWithBreak,
} from '../../src/constraints/validators/breakPolicy';

describe('Break Policy Validator', () => {
  // Default break policy: 6hr shifts need break between 3-4.5hrs from start
  const defaultPolicy: BreakPolicyConfig = {
    reqShiftLengthForBreak: 360, // 6 hours
    breakWindowStart: 180,        // 3 hours
    breakWindowEnd: 270,          // 4.5 hours
  };

  describe('validateBreakPolicy', () => {
    it('should pass when 6hr shift has break at valid time', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 840,    // 2:00 PM (6 hours)
          hasBreak: true,
          breakStartMinutes: 660,  // 11:00 AM (3hrs from start)
          breakEndMinutes: 690,    // 11:30 AM
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should pass when break is at 4 hours (middle of window)', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 840,    // 2:00 PM (6 hours)
          hasBreak: true,
          breakStartMinutes: 720,  // 12:00 PM (4hrs from start)
          breakEndMinutes: 750,    // 12:30 PM
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(true);
    });

    it('should pass when break is at latest valid time (4.5hrs)', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 840,    // 2:00 PM (6 hours)
          hasBreak: true,
          breakStartMinutes: 750,  // 12:30 PM (4.5hrs from start)
          breakEndMinutes: 780,    // 1:00 PM
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(true);
    });

    it('should pass when short shift (5hr) has no break', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 780,    // 1:00 PM (5 hours - under 6hr requirement)
          hasBreak: false,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(true);
    });

    it('should fail when 6hr shift has no break', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 840,    // 2:00 PM (6 hours)
          hasBreak: false,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('1234567');
      expect(result.violations[0]).toContain('360min');
      expect(result.violations[0]).toContain('requires break but has none');
    });

    it('should fail when 7hr shift has no break', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 900,    // 3:00 PM (7 hours)
          hasBreak: false,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('requires break');
    });

    it('should fail when break is too early (2hrs from start)', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 840,    // 2:00 PM (6 hours)
          hasBreak: true,
          breakStartMinutes: 600,  // 10:00 AM (only 2hrs from start, need 3hrs)
          breakEndMinutes: 630,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('too early');
      expect(result.violations[0]).toContain('120min');
      expect(result.violations[0]).toContain('180min');
    });

    it('should fail when break is too late (5hrs from start)', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 840,    // 2:00 PM (6 hours)
          hasBreak: true,
          breakStartMinutes: 780,  // 1:00 PM (5hrs from start, max is 4.5hrs)
          breakEndMinutes: 810,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('too late');
      expect(result.violations[0]).toContain('300min');
      expect(result.violations[0]).toContain('270min');
    });

    it('should fail when short shift has unnecessary break', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,  // 8:00 AM
          endMinutes: 780,    // 1:00 PM (5 hours - too short)
          hasBreak: true,
          breakStartMinutes: 660,
          breakEndMinutes: 690,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('has break but is too short');
      expect(result.violations[0]).toContain('300min');
      expect(result.violations[0]).toContain('360min');
    });

    it('should validate multiple shifts correctly', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1111111',
          startMinutes: 480,
          endMinutes: 840,  // 6hr - needs break
          hasBreak: true,
          breakStartMinutes: 660,  // Valid (3hrs)
          breakEndMinutes: 690,
        },
        {
          crewId: '2222222',
          startMinutes: 480,
          endMinutes: 780,  // 5hr - no break needed
          hasBreak: false,
        },
        {
          crewId: '3333333',
          startMinutes: 480,
          endMinutes: 900,  // 7hr - needs break
          hasBreak: true,
          breakStartMinutes: 720,  // Valid (4hrs)
          breakEndMinutes: 750,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(true);
    });

    it('should detect multiple violations across shifts', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1111111',
          startMinutes: 480,
          endMinutes: 840,  // 6hr - needs break
          hasBreak: false,  // VIOLATION: missing break
        },
        {
          crewId: '2222222',
          startMinutes: 480,
          endMinutes: 780,  // 5hr - no break needed
          hasBreak: true,   // VIOLATION: unnecessary break
          breakStartMinutes: 660,
          breakEndMinutes: 690,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[0]).toContain('requires break');
      expect(result.violations[1]).toContain('2222222');
      expect(result.violations[1]).toContain('too short');
    });

    it('should handle exactly 6hr shift (boundary case)', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,
          endMinutes: 840,  // Exactly 360min = 6hrs
          hasBreak: true,
          breakStartMinutes: 660,
          breakEndMinutes: 690,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(true);
    });

    it('should handle 5hr 59min shift (just under requirement)', () => {
      const shifts: ShiftWithBreak[] = [
        {
          crewId: '1234567',
          startMinutes: 480,
          endMinutes: 839,  // 359min - just under 6hr
          hasBreak: false,
        },
      ];

      const result = validateBreakPolicy(shifts, defaultPolicy);
      expect(result.valid).toBe(true);
    });
  });

  describe('shiftRequiresBreak', () => {
    it('should return true for 6hr shift', () => {
      expect(shiftRequiresBreak(360, defaultPolicy)).toBe(true);
    });

    it('should return true for 7hr shift', () => {
      expect(shiftRequiresBreak(420, defaultPolicy)).toBe(true);
    });

    it('should return false for 5hr shift', () => {
      expect(shiftRequiresBreak(300, defaultPolicy)).toBe(false);
    });

    it('should return false for 5hr 59min shift', () => {
      expect(shiftRequiresBreak(359, defaultPolicy)).toBe(false);
    });
  });

  describe('getBreakWindow', () => {
    it('should return correct break window for 8am shift', () => {
      const window = getBreakWindow(480, defaultPolicy);
      expect(window.earliestBreak).toBe(660);  // 11:00 AM (8am + 3hrs)
      expect(window.latestBreak).toBe(750);    // 12:30 PM (8am + 4.5hrs)
    });

    it('should return correct break window for 9am shift', () => {
      const window = getBreakWindow(540, defaultPolicy);
      expect(window.earliestBreak).toBe(720);  // 12:00 PM (9am + 3hrs)
      expect(window.latestBreak).toBe(810);    // 1:30 PM (9am + 4.5hrs)
    });
  });

  describe('isBreakTimeValid', () => {
    it('should return true for break at 3hrs from start', () => {
      expect(isBreakTimeValid(480, 660, defaultPolicy)).toBe(true);
    });

    it('should return true for break at 4hrs from start', () => {
      expect(isBreakTimeValid(480, 720, defaultPolicy)).toBe(true);
    });

    it('should return true for break at 4.5hrs from start', () => {
      expect(isBreakTimeValid(480, 750, defaultPolicy)).toBe(true);
    });

    it('should return false for break at 2hrs from start', () => {
      expect(isBreakTimeValid(480, 600, defaultPolicy)).toBe(false);
    });

    it('should return false for break at 5hrs from start', () => {
      expect(isBreakTimeValid(480, 780, defaultPolicy)).toBe(false);
    });
  });
});
