import { describe, it, expect } from 'vitest';
import {
  validateCrewQualifications,
  isCrewQualified,
  getQualifiedRoles,
  getQualifiedCrew,
  getQualificationSummary,
  type CrewRoleQualification,
} from '../../src/constraints/validators/crewQualification';
import type { SolverAssignment } from '../../src/constraints/types';

describe('Crew Qualification Validator', () => {
  // Sample qualifications: crew qualified for specific roles
  const qualifications: CrewRoleQualification[] = [
    { crewId: '1111111', roleId: 1 }, // Crew 1: Register
    { crewId: '1111111', roleId: 2 }, // Crew 1: Demo
    { crewId: '2222222', roleId: 1 }, // Crew 2: Register
    { crewId: '2222222', roleId: 3 }, // Crew 2: Wine Demo
    { crewId: '3333333', roleId: 2 }, // Crew 3: Demo only
  ];

  const roleCodeMap = new Map([
    [1, 'REGISTER'],
    [2, 'DEMO'],
    [3, 'WINE_DEMO'],
    [4, 'ORDER_WRITER'],
  ]);

  describe('validateCrewQualifications', () => {
    it('should pass when all assignments are qualified', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1, // Crew 1 qualified for Register
          startMinutes: 480,
          endMinutes: 540,
        },
        {
          crewId: '2222222',
          roleId: 1, // Crew 2 qualified for Register
          startMinutes: 540,
          endMinutes: 600,
        },
        {
          crewId: '3333333',
          roleId: 2, // Crew 3 qualified for Demo
          startMinutes: 600,
          endMinutes: 660,
        },
      ];

      const result = validateCrewQualifications(assignments, qualifications, roleCodeMap);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should pass when crew has multiple roles', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1, // Register - qualified
          startMinutes: 480,
          endMinutes: 540,
        },
        {
          crewId: '1111111',
          roleId: 2, // Demo - also qualified
          startMinutes: 600,
          endMinutes: 660,
        },
      ];

      const result = validateCrewQualifications(assignments, qualifications, roleCodeMap);
      expect(result.valid).toBe(true);
    });

    it('should fail when crew assigned to unqualified role', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '3333333',
          roleId: 1, // Crew 3 NOT qualified for Register (only Demo)
          startMinutes: 480,
          endMinutes: 540,
        },
      ];

      const result = validateCrewQualifications(assignments, qualifications, roleCodeMap);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('3333333');
      expect(result.violations[0]).toContain('REGISTER');
      expect(result.violations[0]).toContain('not qualified');
    });

    it('should fail when crew assigned to role that does not exist in qualifications', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 4, // Order Writer - Crew 1 not qualified
          startMinutes: 480,
          endMinutes: 540,
        },
      ];

      const result = validateCrewQualifications(assignments, qualifications, roleCodeMap);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[0]).toContain('ORDER_WRITER');
    });

    it('should detect multiple unqualified assignments', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 3, // Wine Demo - not qualified
          startMinutes: 480,
          endMinutes: 540,
        },
        {
          crewId: '2222222',
          roleId: 2, // Demo - not qualified (only has Register and Wine Demo)
          startMinutes: 540,
          endMinutes: 600,
        },
        {
          crewId: '3333333',
          roleId: 1, // Register - not qualified (only has Demo)
          startMinutes: 600,
          endMinutes: 660,
        },
      ];

      const result = validateCrewQualifications(assignments, qualifications, roleCodeMap);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(3);
      expect(result.violations[0]).toContain('1111111');
      expect(result.violations[0]).toContain('WINE_DEMO');
      expect(result.violations[1]).toContain('2222222');
      expect(result.violations[1]).toContain('DEMO');
      expect(result.violations[2]).toContain('3333333');
      expect(result.violations[2]).toContain('REGISTER');
    });

    it('should handle empty assignments', () => {
      const assignments: SolverAssignment[] = [];

      const result = validateCrewQualifications(assignments, qualifications, roleCodeMap);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should handle empty qualifications (all assignments invalid)', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 540,
        },
      ];

      const result = validateCrewQualifications(assignments, [], roleCodeMap);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
    });

    it('should pass when same crew-role pair appears multiple times', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480,
          endMinutes: 540,
        },
        {
          crewId: '1111111',
          roleId: 1, // Same crew, same role - both should be valid
          startMinutes: 600,
          endMinutes: 660,
        },
      ];

      const result = validateCrewQualifications(assignments, qualifications, roleCodeMap);
      expect(result.valid).toBe(true);
    });
  });

  describe('isCrewQualified', () => {
    it('should return true when crew is qualified', () => {
      expect(isCrewQualified('1111111', 1, qualifications)).toBe(true);
      expect(isCrewQualified('1111111', 2, qualifications)).toBe(true);
      expect(isCrewQualified('2222222', 3, qualifications)).toBe(true);
    });

    it('should return false when crew is not qualified', () => {
      expect(isCrewQualified('1111111', 3, qualifications)).toBe(false);
      expect(isCrewQualified('3333333', 1, qualifications)).toBe(false);
      expect(isCrewQualified('9999999', 1, qualifications)).toBe(false);
    });
  });

  describe('getQualifiedRoles', () => {
    it('should return all roles crew is qualified for', () => {
      const roles1 = getQualifiedRoles('1111111', qualifications);
      expect(roles1).toEqual([1, 2]);

      const roles2 = getQualifiedRoles('2222222', qualifications);
      expect(roles2).toEqual([1, 3]);

      const roles3 = getQualifiedRoles('3333333', qualifications);
      expect(roles3).toEqual([2]);
    });

    it('should return empty array for unqualified crew', () => {
      const roles = getQualifiedRoles('9999999', qualifications);
      expect(roles).toEqual([]);
    });
  });

  describe('getQualifiedCrew', () => {
    it('should return all crew qualified for a role', () => {
      const crew1 = getQualifiedCrew(1, qualifications);
      expect(crew1).toEqual(['1111111', '2222222']);

      const crew2 = getQualifiedCrew(2, qualifications);
      expect(crew2).toEqual(['1111111', '3333333']);

      const crew3 = getQualifiedCrew(3, qualifications);
      expect(crew3).toEqual(['2222222']);
    });

    it('should return empty array for role with no qualified crew', () => {
      const crew = getQualifiedCrew(4, qualifications);
      expect(crew).toEqual([]);
    });
  });

  describe('getQualificationSummary', () => {
    it('should return qualification summary map', () => {
      const summary = getQualificationSummary(qualifications);
      
      expect(summary.get('1111111')).toEqual([1, 2]);
      expect(summary.get('2222222')).toEqual([1, 3]);
      expect(summary.get('3333333')).toEqual([2]);
      expect(summary.size).toBe(3);
    });

    it('should handle empty qualifications', () => {
      const summary = getQualificationSummary([]);
      expect(summary.size).toBe(0);
    });
  });
});
