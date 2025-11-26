import { describe, it, expect } from 'vitest';
import {
  validateDailyHours,
  getHoursSummary,
  validateMultipleDailyHours,
  type DailyHoursRequirement,
} from '../../src/constraints/validators/dailyHours';
import type { SolverAssignment } from '../../src/constraints/types';

describe('Daily Hours Validator', () => {
  describe('validateDailyHours', () => {
    it('should pass when crew works exactly required hours', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 1.5,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 690,    // 11:30 AM (1.5 hours)
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should pass when multiple assignments sum to required hours', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 2,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 660,    // 11:00 AM (1 hour)
        },
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 720,  // 12:00 PM
          endMinutes: 780,    // 1:00 PM (1 hour)
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should pass with 1 hour requirement (blockSize=2)', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 660,    // 11:00 AM (1 hour)
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(true);
    });

    it('should fail when crew works too few hours', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 2,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 660,    // 11:00 AM (only 1 hour)
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('1234567');
      expect(result.violations[0]).toContain('ORDER_WRITER');
      expect(result.violations[0]).toContain('1hr');
      expect(result.violations[0]).toContain('2hr');
      expect(result.violations[0]).toContain('UNDER');
    });

    it('should fail when crew works too many hours', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 690,    // 11:30 AM (1.5 hours - too much!)
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('1234567');
      expect(result.violations[0]).toContain('1.5hr');
      expect(result.violations[0]).toContain('1hr');
      expect(result.violations[0]).toContain('OVER');
    });

    it('should fail when no assignments for required crew', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 1,
      };

      const assignments: SolverAssignment[] = [];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('0hr');
      expect(result.violations[0]).toContain('1hr');
      expect(result.violations[0]).toContain('UNDER');
    });

    it('should ignore assignments from other crew members', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660, // 1 hour
        },
        {
          crewId: '9999999', // Different crew
          roleId: 5,
          startMinutes: 660,
          endMinutes: 780, // This should be ignored
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(true); // Only counts crew 1234567's 1 hour
    });

    it('should handle fractional hours (1.5hr requirement)', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 1.5,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 690,    // 11:30 AM (90 minutes = 1.5 hours)
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(true);
    });

    it('should handle three separate assignments summing to required hours', () => {
      const requirement: DailyHoursRequirement = {
        crewId: '1234567',
        requiredHours: 1.5,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 630,  // 30 min
        },
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 660,
          endMinutes: 690,  // 30 min
        },
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 720,
          endMinutes: 750,  // 30 min
        },
      ];

      const result = validateDailyHours(assignments, requirement, 'ORDER_WRITER');
      expect(result.valid).toBe(true);
    });
  });

  describe('getHoursSummary', () => {
    it('should return correct hours summary for single assignment', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 690,
        },
      ];

      const summary = getHoursSummary(assignments, '1234567');
      expect(summary.totalHours).toBe(1.5);
      expect(summary.assignmentCount).toBe(1);
      expect(summary.assignments.length).toBe(1);
      expect(summary.assignments[0].hours).toBe(1.5);
    });

    it('should return correct hours summary for multiple assignments', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660,
        },
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 720,
          endMinutes: 780,
        },
      ];

      const summary = getHoursSummary(assignments, '1234567');
      expect(summary.totalHours).toBe(2);
      expect(summary.assignmentCount).toBe(2);
      expect(summary.assignments[0].hours).toBe(1);
      expect(summary.assignments[1].hours).toBe(1);
    });

    it('should filter to only specified crew', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660,
        },
        {
          crewId: '9999999',
          roleId: 5,
          startMinutes: 660,
          endMinutes: 780,
        },
      ];

      const summary = getHoursSummary(assignments, '1234567');
      expect(summary.totalHours).toBe(1);
      expect(summary.assignmentCount).toBe(1);
    });
  });

  describe('validateMultipleDailyHours', () => {
    it('should validate multiple crew requirements at once', () => {
      const requirements: DailyHoursRequirement[] = [
        { crewId: '1111111', requiredHours: 1 },
        { crewId: '2222222', requiredHours: 1.5 },
        { crewId: '3333333', requiredHours: 2 },
      ];

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660, // 1hr
        },
        {
          crewId: '2222222',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 690, // 1.5hr
        },
        {
          crewId: '3333333',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 720, // 2hr
        },
      ];

      const result = validateMultipleDailyHours(assignments, requirements, 'ORDER_WRITER');
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should detect violations from multiple crew', () => {
      const requirements: DailyHoursRequirement[] = [
        { crewId: '1111111', requiredHours: 1 },
        { crewId: '2222222', requiredHours: 2 }, // This one will fail
        { crewId: '3333333', requiredHours: 1 },
      ];

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660, // 1hr - OK
        },
        {
          crewId: '2222222',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660, // Only 1hr, needs 2hr - FAIL
        },
        {
          crewId: '3333333',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660, // 1hr - OK
        },
      ];

      const result = validateMultipleDailyHours(assignments, requirements, 'ORDER_WRITER');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('2222222');
      expect(result.violations[0]).toContain('1hr');
      expect(result.violations[0]).toContain('2hr');
    });

    it('should accumulate all violations from all crew', () => {
      const requirements: DailyHoursRequirement[] = [
        { crewId: '1111111', requiredHours: 2 },
        { crewId: '2222222', requiredHours: 2 },
      ];

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660, // Only 1hr - FAIL
        },
        {
          crewId: '2222222',
          roleId: 5,
          startMinutes: 600,
          endMinutes: 660, // Only 1hr - FAIL
        },
      ];

      const result = validateMultipleDailyHours(assignments, requirements, 'ORDER_WRITER');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[1]).toContain('2222222');
    });
  });
});
