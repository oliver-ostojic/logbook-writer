import { describe, it, expect } from 'vitest';
import {
  validateNoOverlappingShifts,
  doAssignmentsOverlap,
  findOverlaps,
  getCrewAssignments,
  wouldCreateOverlap,
} from '../../src/constraints/validators/noOverlap';
import type { SolverAssignment } from '../../src/constraints/types';

describe('No Overlapping Shifts Validator', () => {
  describe('validateNoOverlappingShifts', () => {
    it('should pass when no assignments overlap', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 600,    // 10:00 AM
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 660,  // 11:00 AM
          endMinutes: 780,    // 1:00 PM
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should pass when assignments handoff exactly (end = start)', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 600,    // 10:00 AM
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM (exact handoff)
          endMinutes: 720,    // 12:00 PM
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(true);
    });

    it('should pass when different crew have overlapping times', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 720,
        },
        {
          crewId: '2222222', // Different crew
          roleId: 1,
          startMinutes: 480,  // Same time - OK since different crew
          endMinutes: 720,
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(true);
    });

    it('should fail when assignments overlap', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 600,    // 10:00 AM
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 540,  // 9:00 AM (overlaps with first)
          endMinutes: 660,    // 11:00 AM
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[0]).toContain('overlapping');
      expect(result.violations[0]).toContain('9:00AM-10:00AM');
      expect(result.violations[0]).toContain('60min');
    });

    it('should fail when one assignment completely contains another', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,  // 8:00 AM
          endMinutes: 840,    // 2:00 PM (large shift)
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 600,  // 10:00 AM (inside first shift)
          endMinutes: 720,    // 12:00 PM
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('overlapping');
    });

    it('should detect multiple overlaps for same crew', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 540,  // Overlaps with first
          endMinutes: 660,
        },
        {
          crewId: '1111111',
          roleId: 3,
          startMinutes: 630,  // Overlaps with second
          endMinutes: 720,
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2); // 1-2 overlap, 2-3 overlap
    });

    it('should detect overlaps across multiple crew members', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 540,  // Crew 1 overlap
          endMinutes: 660,
        },
        {
          crewId: '2222222',
          roleId: 1,
          startMinutes: 600,
          endMinutes: 720,
        },
        {
          crewId: '2222222',
          roleId: 2,
          startMinutes: 660,  // Crew 2 overlap
          endMinutes: 780,
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[1]).toContain('2222222');
    });

    it('should handle empty assignments', () => {
      const assignments: SolverAssignment[] = [];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should handle single assignment', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(true);
    });

    it('should detect 1-minute overlap', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 599,  // 1 minute overlap
          endMinutes: 660,
        },
      ];

      const result = validateNoOverlappingShifts(assignments);
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('1min');
    });
  });

  describe('doAssignmentsOverlap', () => {
    it('should return true when assignments overlap', () => {
      const a: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600,
      };
      const b: SolverAssignment = {
        crewId: '1111111',
        roleId: 2,
        startMinutes: 540,
        endMinutes: 660,
      };

      expect(doAssignmentsOverlap(a, b)).toBe(true);
    });

    it('should return false when assignments do not overlap', () => {
      const a: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600,
      };
      const b: SolverAssignment = {
        crewId: '1111111',
        roleId: 2,
        startMinutes: 660,
        endMinutes: 720,
      };

      expect(doAssignmentsOverlap(a, b)).toBe(false);
    });

    it('should return false for exact handoff (end = start)', () => {
      const a: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600,
      };
      const b: SolverAssignment = {
        crewId: '1111111',
        roleId: 2,
        startMinutes: 600,
        endMinutes: 720,
      };

      expect(doAssignmentsOverlap(a, b)).toBe(false);
    });

    it('should return false when different crew', () => {
      const a: SolverAssignment = {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600,
      };
      const b: SolverAssignment = {
        crewId: '2222222', // Different crew
        roleId: 2,
        startMinutes: 480,
        endMinutes: 600,
      };

      expect(doAssignmentsOverlap(a, b)).toBe(false);
    });
  });

  describe('findOverlaps', () => {
    it('should find all overlapping pairs', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 540,
          endMinutes: 660,
        },
        {
          crewId: '1111111',
          roleId: 3,
          startMinutes: 720,
          endMinutes: 780,
        },
      ];

      const overlaps = findOverlaps(assignments);
      expect(overlaps.length).toBe(1);
      expect(overlaps[0].a.roleId).toBe(1);
      expect(overlaps[0].b.roleId).toBe(2);
    });

    it('should return empty array when no overlaps', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 600,
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 660,
          endMinutes: 720,
        },
      ];

      const overlaps = findOverlaps(assignments);
      expect(overlaps.length).toBe(0);
    });
  });

  describe('getCrewAssignments', () => {
    it('should filter and sort assignments for crew', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '2222222',
          roleId: 1,
          startMinutes: 600,
          endMinutes: 660,
        },
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 540,
          endMinutes: 600,
        },
        {
          crewId: '1111111',
          roleId: 2,
          startMinutes: 480,
          endMinutes: 540,
        },
      ];

      const crewAssignments = getCrewAssignments('1111111', assignments);
      expect(crewAssignments.length).toBe(2);
      expect(crewAssignments[0].startMinutes).toBe(480); // Sorted by start time
      expect(crewAssignments[1].startMinutes).toBe(540);
    });
  });

  describe('wouldCreateOverlap', () => {
    const existingAssignments: SolverAssignment[] = [
      {
        crewId: '1111111',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600,
      },
      {
        crewId: '2222222',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600,
      },
    ];

    it('should return true when new assignment overlaps', () => {
      const newAssignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 2,
        startMinutes: 540,
        endMinutes: 660,
      };

      expect(wouldCreateOverlap(newAssignment, existingAssignments)).toBe(true);
    });

    it('should return false when new assignment does not overlap', () => {
      const newAssignment: SolverAssignment = {
        crewId: '1111111',
        roleId: 2,
        startMinutes: 660,
        endMinutes: 720,
      };

      expect(wouldCreateOverlap(newAssignment, existingAssignments)).toBe(false);
    });

    it('should return false when different crew', () => {
      const newAssignment: SolverAssignment = {
        crewId: '3333333', // New crew
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600,
      };

      expect(wouldCreateOverlap(newAssignment, existingAssignments)).toBe(false);
    });
  });
});
