import { describe, it, expect } from 'vitest';
import {
  validateWindowCoverage,
  getWindowCoverageSummary,
  isWindowFullyCovered,
  type WindowCoverageRequirement,
} from '../../src/constraints/validators/windowCoverage';
import type { SolverAssignment } from '../../src/constraints/types';

describe('Window Coverage Validator', () => {
  describe('validateWindowCoverage', () => {
    it('should pass when single crew covers entire window', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10, // 10am
        endHour: 19,   // 7pm (19:00)
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 1140,   // 7:00 PM (19:00)
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when multiple crew cover window without overlaps', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17, // 5pm
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 840,    // 2:00 PM
        },
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 840,  // 2:00 PM (handoff, no overlap)
          endMinutes: 1020,   // 5:00 PM
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'WINE_DEMO');
      expect(result.valid).toBe(true);
    });

    it('should fail when crew shifts overlap (overstaffing)', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 840,    // 2:00 PM
        },
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 780,  // 1:00 PM (overlaps with first crew!)
          endMinutes: 1020,   // 5:00 PM
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('1:00 PM'); // Hour 13 has 2 crew
      expect(result.violations[0]).toContain('overstaffed');
      expect(result.violations[0]).toContain('2 crew');
    });

    it('should fail when shifts overlap (overstaffing during overlap)', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 840,    // 2:00 PM
        },
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 780,  // 1:00 PM (overlaps with first crew)
          endMinutes: 1020,   // 5:00 PM
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'WINE_DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('overstaffed');
      expect(result.violations[0]).toContain('2 crew');
    });

    it('should fail when gap in coverage', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 780,    // 1:00 PM
        },
        // GAP: 1pm-2pm not covered!
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 840,  // 2:00 PM
          endMinutes: 1020,   // 5:00 PM
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('1:00 PM'); // 13:00
      expect(result.violations[0]).toContain('understaffed');
      expect(result.violations[0]).toContain('0 crew');
    });

    it('should fail when coverage starts too late', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 660,  // 11:00 AM (starts 1 hour late)
          endMinutes: 1020,   // 5:00 PM
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('10:00 AM');
      expect(result.violations[0]).toContain('understaffed');
    });

    it('should fail when coverage ends too early', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 960,    // 4:00 PM (ends 1 hour early)
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('4:00 PM'); // 16:00
      expect(result.violations[0]).toContain('understaffed');
    });

    it('should require exactly N crew per hour when requiredPerHour > 1', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 14, // 2pm
        requiredPerHour: 2, // Need 2 crew during every hour
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 840,    // 2:00 PM
        },
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM
          endMinutes: 840,    // 2:00 PM
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(true);
    });

    it('should fail when not enough crew for requiredPerHour > 1', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 14,
        requiredPerHour: 2,
      };

      const assignments: SolverAssignment[] = [
        // Only 1 crew, need 2!
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 840,
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(4); // All 4 hours understaffed
      expect(result.violations[0]).toContain('1 crew');
      expect(result.violations[0]).toContain('need 2');
    });

    it('should detect overstaffing', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 12,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 720,
        },
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 720,
        },
        // 2 crew, need only 1!
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2); // Both hours overstaffed
      expect(result.violations[0]).toContain('overstaffed');
      expect(result.violations[0]).toContain('2 crew');
      expect(result.violations[0]).toContain('need 1');
    });

    it('should handle crew handoff at hour boundary (blockSize=2)', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 13,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        // 10:00-12:00 (blockSize=2: 4 slots = 2hr)
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 720,
        },
        // 12:00-1:00 (blockSize=2: 2 slots = 1hr) - picks up exactly when crew1 drops off
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 720,
          endMinutes: 780,
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(true);
    });

    it('should handle empty assignments for window requiring zero crew', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 12,
        requiredPerHour: 0,
      };

      const assignments: SolverAssignment[] = [];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(true);
    });

    it('should fail when crew assigned but zero required', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 11,
        requiredPerHour: 0,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 660,
        },
      ];

      const result = validateWindowCoverage(assignments, requirement, 'DEMO');
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('overstaffed');
    });
  });

  describe('getWindowCoverageSummary', () => {
    it('should return coverage for all hours in window', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 13,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10am
          endMinutes: 720,    // 12pm
        },
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 660,  // 11am
          endMinutes: 780,    // 1pm
        },
      ];

      const summary = getWindowCoverageSummary(assignments, requirement);

      expect(summary.size).toBe(3);
      expect(summary.get(10)).toEqual({ actual: 1, required: 1 }); // 10-11am: crew1
      expect(summary.get(11)).toEqual({ actual: 2, required: 1 }); // 11am-12pm: crew1 + crew2
      expect(summary.get(12)).toEqual({ actual: 1, required: 1 }); // 12-1pm: crew2
    });

    it('should show gaps in coverage', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 14,
        requiredPerHour: 2,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 720,
        },
      ];

      const summary = getWindowCoverageSummary(assignments, requirement);

      expect(summary.get(10)).toEqual({ actual: 1, required: 2 }); // Understaffed
      expect(summary.get(13)).toEqual({ actual: 0, required: 2 }); // No coverage
    });
  });

  describe('isWindowFullyCovered', () => {
    it('should return true when window fully covered', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 1020,
        },
      ];

      const result = isWindowFullyCovered(assignments, requirement);
      expect(result).toBe(true);
    });

    it('should return false when gap exists', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 780,
        },
        // Gap here!
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 840,
          endMinutes: 1020,
        },
      ];

      const result = isWindowFullyCovered(assignments, requirement);
      expect(result).toBe(false);
    });

    it('should return false when understaffed', () => {
      const requirement: WindowCoverageRequirement = {
        startHour: 10,
        endHour: 12,
        requiredPerHour: 2,
      };

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,
          endMinutes: 720,
        },
        // Need 2 crew, only have 1
      ];

      const result = isWindowFullyCovered(assignments, requirement);
      expect(result).toBe(false);
    });
  });
});
