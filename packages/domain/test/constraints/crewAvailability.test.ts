import { describe, it, expect } from 'vitest';
import {
  validateCrewAvailability,
  isAssignmentWithinAvailability,
  getAvailabilityWindow,
  getAvailabilityViolationMinutes,
  type CrewAvailability,
} from '../../src/constraints/validators/crewAvailability';
import type { SolverAssignment } from '../../src/constraints/types';

describe('Crew Availability Validator', () => {
  // Sample crew availabilities
  const availabilities: CrewAvailability[] = [
    {
      crewId: '1111111',
      shiftStartMin: 480,  // 8:00 AM
      shiftEndMin: 840,    // 2:00 PM
    },
    {
      crewId: '2222222',
      shiftStartMin: 540,  // 9:00 AM
      shiftEndMin: 1020,   // 5:00 PM
    },
    {
      crewId: '3333333',
      shiftStartMin: 600,  // 10:00 AM
      shiftEndMin: 900,    // 3:00 PM
    },
  ];

  describe('validateCrewAvailability', () => {
    it('should pass when all assignments are within availability', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,  // 8:00 AM (at start)
          endMinutes: 840,    // 2:00 PM (at end)
        },
        {
          crewId: '2222222',
          roleId: 1,
          startMinutes: 600,  // 10:00 AM (within window)
          endMinutes: 900,    // 3:00 PM (within window)
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should pass when assignment exactly matches availability window', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 840,
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(true);
    });

    it('should pass when assignment is subset of availability', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 540,  // 9:00 AM (1hr after start)
          endMinutes: 780,    // 1:00 PM (1hr before end)
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(true);
    });

    it('should fail when assignment starts too early', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 420,  // 7:00 AM (crew starts at 8am)
          endMinutes: 600,    // 10:00 AM
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[0]).toContain('7:00AM');
      expect(result.violations[0]).toContain('8:00AM');
      expect(result.violations[0]).toContain('starts');
      expect(result.violations[0]).toContain('60min too early');
    });

    it('should fail when assignment ends too late', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 720,  // 12:00 PM
          endMinutes: 900,    // 3:00 PM (crew ends at 2pm)
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[0]).toContain('3:00PM');
      expect(result.violations[0]).toContain('2:00PM');
      expect(result.violations[0]).toContain('ends');
      expect(result.violations[0]).toContain('60min too late');
    });

    it('should fail when assignment both starts early and ends late', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 420,  // 7:00 AM (1hr early)
          endMinutes: 900,    // 3:00 PM (1hr late)
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2); // Both violations
      expect(result.violations[0]).toContain('starts');
      expect(result.violations[1]).toContain('ends');
    });

    it('should fail when crew has no availability defined', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '9999999', // Not in availabilities list
          roleId: 1,
          startMinutes: 480,
          endMinutes: 540,
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('9999999');
      expect(result.violations[0]).toContain('no availability window');
    });

    it('should detect multiple violations across crew', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 420,  // Too early
          endMinutes: 600,
        },
        {
          crewId: '2222222',
          roleId: 1,
          startMinutes: 900,
          endMinutes: 1080,   // Too late
        },
        {
          crewId: '3333333',
          roleId: 1,
          startMinutes: 600,
          endMinutes: 660,    // Valid
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[1]).toContain('2222222');
    });

    it('should handle empty assignments', () => {
      const assignments: SolverAssignment[] = [];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should validate multiple assignments for same crew', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,  // Valid
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 660,
          endMinutes: 840,  // Valid
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(true);
    });

    it('should detect if one of multiple assignments is invalid', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,  // Valid
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 780,
          endMinutes: 900,  // Invalid - ends too late
        },
      ];

      const result = validateCrewAvailability(assignments, availabilities);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('ends');
    });
  });

  describe('isAssignmentWithinAvailability', () => {
    const availability: CrewAvailability = {
      crewId: '1111111',
      shiftStartMin: 480,
      shiftEndMin: 840,
    };

    it('should return true when assignment is within availability', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 780,
      };

      expect(isAssignmentWithinAvailability(assignment, availability)).toBe(true);
    });

    it('should return true when assignment exactly matches availability', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 840,
      };

      expect(isAssignmentWithinAvailability(assignment, availability)).toBe(true);
    });

    it('should return false when assignment starts too early', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 420,
        endMinutes: 600,
      };

      expect(isAssignmentWithinAvailability(assignment, availability)).toBe(false);
    });

    it('should return false when assignment ends too late', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 720,
        endMinutes: 900,
      };

      expect(isAssignmentWithinAvailability(assignment, availability)).toBe(false);
    });

    it('should return false when crewId does not match', () => {
      const assignment: SolverAssignment = {
        crewId: '2222222',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 780,
      };

      expect(isAssignmentWithinAvailability(assignment, availability)).toBe(false);
    });
  });

  describe('getAvailabilityWindow', () => {
    it('should return availability for existing crew', () => {
      const window = getAvailabilityWindow('1111111', availabilities);
      expect(window).toBeDefined();
      expect(window?.crewId).toBe('1111111');
      expect(window?.shiftStartMin).toBe(480);
      expect(window?.shiftEndMin).toBe(840);
    });

    it('should return undefined for non-existent crew', () => {
      const window = getAvailabilityWindow('9999999', availabilities);
      expect(window).toBeUndefined();
    });
  });

  describe('getAvailabilityViolationMinutes', () => {
    const availability: CrewAvailability = {
      crewId: '1111111',
      shiftStartMin: 480,
      shiftEndMin: 840,
    };

    it('should return zero violation for valid assignment', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 780,
      };

      const violation = getAvailabilityViolationMinutes(assignment, availability);
      expect(violation.earlyMinutes).toBe(0);
      expect(violation.lateMinutes).toBe(0);
      expect(violation.totalViolation).toBe(0);
    });

    it('should calculate early start violation', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 420,  // 60 min early
        endMinutes: 600,
      };

      const violation = getAvailabilityViolationMinutes(assignment, availability);
      expect(violation.earlyMinutes).toBe(60);
      expect(violation.lateMinutes).toBe(0);
      expect(violation.totalViolation).toBe(60);
    });

    it('should calculate late end violation', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 720,
        endMinutes: 900,  // 60 min late
      };

      const violation = getAvailabilityViolationMinutes(assignment, availability);
      expect(violation.earlyMinutes).toBe(0);
      expect(violation.lateMinutes).toBe(60);
      expect(violation.totalViolation).toBe(60);
    });

    it('should calculate both early and late violations', () => {
      const assignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 420,  // 60 min early
        endMinutes: 900,    // 60 min late
      };

      const violation = getAvailabilityViolationMinutes(assignment, availability);
      expect(violation.earlyMinutes).toBe(60);
      expect(violation.lateMinutes).toBe(60);
      expect(violation.totalViolation).toBe(120);
    });
  });
});
