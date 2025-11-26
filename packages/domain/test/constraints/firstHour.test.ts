/**
 * Tests for FIRST_HOUR preference scorer
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreFirstHourPreferences, 
  scoreCrewFirstHour,
  getFirstHourSatisfactionSummary,
  wouldSatisfyFirstHour
} from '../../src/constraints/scorers/firstHour';
import type { SolverAssignment, PreferenceConfig, CrewConfig } from '../../src/constraints/types';

describe('FIRST_HOUR Preference Scorer', () => {
  // Test data
  const crew: CrewConfig[] = [
    { id: 'CREW001', name: 'Alice', cachedShiftStartMin: 480, cachedShiftEndMin: 960, qualifiedRoleIds: [1, 2] },
    { id: 'CREW002', name: 'Bob', cachedShiftStartMin: 540, cachedShiftEndMin: 1020, qualifiedRoleIds: [1, 2, 3] },
    { id: 'CREW003', name: 'Charlie', cachedShiftStartMin: 600, cachedShiftEndMin: 1080, qualifiedRoleIds: [2, 3] },
  ];

  describe('scoreFirstHourPreferences', () => {
    it('should return 0 score when no FIRST_HOUR preferences exist', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const result = scoreFirstHourPreferences(assignments, preferences, crew);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('No FIRST_HOUR preferences');
    });

    it('should score satisfied FIRST_HOUR preference', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // First assignment, role 1
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: 1, 
          preferenceType: 'FIRST_HOUR', 
          baseWeight: 2, 
          crewWeight: 3, 
          adaptiveBoost: 1.5 
        }
      ];
      
      const result = scoreFirstHourPreferences(assignments, preferences, crew);
      
      // Score = baseWeight * crewWeight * adaptiveBoost = 2 * 3 * 1.5 = 9
      expect(result.score).toBe(9);
      expect(result.details).toContain('1/1 satisfied');
    });

    it('should not score when first assignment does not match preferred role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 }, // Wrong role
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 }, // Preferred but not first
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: 1, 
          preferenceType: 'FIRST_HOUR', 
          baseWeight: 2, 
          crewWeight: 3, 
          adaptiveBoost: 1.0 
        }
      ];
      
      const result = scoreFirstHourPreferences(assignments, preferences, crew);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('0/1 satisfied');
    });

    it('should score multiple crew preferences independently', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Satisfies CREW001
        { crewId: 'CREW002', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Satisfies CREW002
        { crewId: 'CREW003', roleId: 1, startMinutes: 600, endMinutes: 660 }, // Does NOT satisfy CREW003
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 2, crewWeight: 2, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FIRST_HOUR', baseWeight: 3, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW003', roleId: 3, preferenceType: 'FIRST_HOUR', baseWeight: 1, crewWeight: 4, adaptiveBoost: 1.0 },
      ];
      
      const result = scoreFirstHourPreferences(assignments, preferences, crew);
      
      // CREW001: 2 * 2 * 1 = 4
      // CREW002: 3 * 1 * 1 = 3
      // CREW003: 0 (wrong role)
      expect(result.score).toBe(7);
      expect(result.details).toContain('2/3 satisfied');
    });

    it('should handle null roleId as "any role" preference', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 5, startMinutes: 480, endMinutes: 540 }, // Any role is fine
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'FIRST_HOUR', baseWeight: 2, crewWeight: 2, adaptiveBoost: 1.0 }
      ];
      
      const result = scoreFirstHourPreferences(assignments, preferences, crew);
      
      expect(result.score).toBe(4); // 2 * 2 * 1
      expect(result.details).toContain('1/1 satisfied');
    });

    it('should apply adaptiveBoost correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 10, crewWeight: 5, adaptiveBoost: 2.5 }
      ];
      
      const result = scoreFirstHourPreferences(assignments, preferences, crew);
      
      // Score = 10 * 5 * 2.5 = 125
      expect(result.score).toBe(125);
    });

    it('should identify earliest assignment as first even if out of order', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Second
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // First (earliest)
        { crewId: 'CREW001', roleId: 3, startMinutes: 600, endMinutes: 660 }, // Third
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 }
      ];
      
      const result = scoreFirstHourPreferences(assignments, preferences, crew);
      
      expect(result.score).toBe(1);
    });
  });

  describe('scoreCrewFirstHour', () => {
    it('should return 0 score when crew has no assignments', () => {
      const assignments: SolverAssignment[] = [];
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFirstHour(preference, assignments);
      
      expect(result.score).toBe(0);
      expect(result.satisfied).toBe(false);
      expect(result.details).toContain('No assignments');
    });

    it('should satisfy when first assignment matches preferred role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFirstHour(preference, assignments);
      
      expect(result.score).toBe(6); // 2 * 3 * 1
      expect(result.satisfied).toBe(true);
    });

    it('should not satisfy when first assignment is different role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFirstHour(preference, assignments);
      
      expect(result.score).toBe(0);
      expect(result.satisfied).toBe(false);
      expect(result.details).toContain('does not match preference');
    });

    it('should handle other crew assignments (ignore them)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW002', roleId: 1, startMinutes: 420, endMinutes: 480 }, // Different crew
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Target crew
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFirstHour(preference, assignments);
      
      expect(result.score).toBe(1);
      expect(result.satisfied).toBe(true);
    });
  });

  describe('getFirstHourSatisfactionSummary', () => {
    it('should provide comprehensive satisfaction statistics', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Satisfied
        { crewId: 'CREW002', roleId: 1, startMinutes: 540, endMinutes: 600 }, // Not satisfied (wants role 2)
        { crewId: 'CREW003', roleId: 3, startMinutes: 600, endMinutes: 660 }, // Satisfied
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 2, crewWeight: 2, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FIRST_HOUR', baseWeight: 3, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW003', roleId: 3, preferenceType: 'FIRST_HOUR', baseWeight: 1, crewWeight: 3, adaptiveBoost: 1.0 },
      ];
      
      const summary = getFirstHourSatisfactionSummary(assignments, preferences, crew);
      
      expect(summary.totalPreferences).toBe(3);
      expect(summary.satisfied).toBe(2);
      expect(summary.unsatisfied).toBe(1);
      expect(summary.totalScore).toBe(7); // 4 + 0 + 3
      expect(summary.averageScore).toBeCloseTo(7 / 3, 2);
      expect(summary.crewDetails).toHaveLength(3);
      expect(summary.crewDetails[0].crewName).toBe('Alice');
      expect(summary.crewDetails[0].satisfied).toBe(true);
      expect(summary.crewDetails[1].satisfied).toBe(false);
    });

    it('should handle empty preferences', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const summary = getFirstHourSatisfactionSummary(assignments, preferences, crew);
      
      expect(summary.totalPreferences).toBe(0);
      expect(summary.satisfied).toBe(0);
      expect(summary.unsatisfied).toBe(0);
      expect(summary.totalScore).toBe(0);
      expect(summary.averageScore).toBe(0);
    });

    it('should show crew details with first assignment info', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FIRST_HOUR', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 }
      ];
      
      const summary = getFirstHourSatisfactionSummary(assignments, preferences, crew);
      
      expect(summary.crewDetails[0].firstAssignmentRoleId).toBe(2);
      expect(summary.crewDetails[0].preferredRoleId).toBe(1);
      expect(summary.crewDetails[0].satisfied).toBe(false);
    });
  });

  describe('wouldSatisfyFirstHour', () => {
    it('should return true when assignment would be first and matches role', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const existingAssignments: SolverAssignment[] = [];
      
      const result = wouldSatisfyFirstHour(assignment, preference, existingAssignments);
      
      expect(result).toBe(true);
    });

    it('should return true when assignment starts earlier than existing', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const existingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }
      ];
      
      const result = wouldSatisfyFirstHour(assignment, preference, existingAssignments);
      
      expect(result).toBe(true);
    });

    it('should return false when assignment is for different crew', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW002',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const existingAssignments: SolverAssignment[] = [];
      
      const result = wouldSatisfyFirstHour(assignment, preference, existingAssignments);
      
      expect(result).toBe(false);
    });

    it('should return false when assignment is wrong role', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 2,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const existingAssignments: SolverAssignment[] = [];
      
      const result = wouldSatisfyFirstHour(assignment, preference, existingAssignments);
      
      expect(result).toBe(false);
    });

    it('should return false when assignment starts later than existing', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 600
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const existingAssignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 }
      ];
      
      const result = wouldSatisfyFirstHour(assignment, preference, existingAssignments);
      
      expect(result).toBe(false);
    });

    it('should return true for null roleId (any role)', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 99,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const existingAssignments: SolverAssignment[] = [];
      
      const result = wouldSatisfyFirstHour(assignment, preference, existingAssignments);
      
      expect(result).toBe(true);
    });
  });
});
