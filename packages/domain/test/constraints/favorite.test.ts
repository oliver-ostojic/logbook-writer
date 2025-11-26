/**
 * Tests for FAVORITE preference scorer
 */

import { describe, it, expect } from 'vitest';
import { 
  scoreFavoritePreferences, 
  scoreCrewFavorite,
  getFavoriteSatisfactionSummary,
  getAssignmentFavoriteScore,
  getPotentialFavoriteScore
} from '../../src/constraints/scorers/favorite';
import type { SolverAssignment, PreferenceConfig, CrewConfig } from '../../src/constraints/types';

describe('FAVORITE Preference Scorer', () => {
  // Test data
  const crew: CrewConfig[] = [
    { id: 'CREW001', name: 'Alice', cachedShiftStartMin: 480, cachedShiftEndMin: 960, qualifiedRoleIds: [1, 2] },
    { id: 'CREW002', name: 'Bob', cachedShiftStartMin: 540, cachedShiftEndMin: 1020, qualifiedRoleIds: [1, 2, 3] },
    { id: 'CREW003', name: 'Charlie', cachedShiftStartMin: 600, cachedShiftEndMin: 1080, qualifiedRoleIds: [2, 3] },
  ];

  describe('scoreFavoritePreferences', () => {
    it('should return 0 score when no FAVORITE preferences exist', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('No FAVORITE preferences');
    });

    it('should score all minutes on favorite role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // 60 min on role 1
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 }, // 60 min on role 1
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: 1, 
          preferenceType: 'FAVORITE', 
          baseWeight: 2, 
          crewWeight: 3, 
          adaptiveBoost: 1.0 
        }
      ];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      // Score = 120 minutes * (2 * 3 * 1.0) = 120 * 6 = 720
      expect(result.score).toBe(720);
      expect(result.details).toContain('120/120 minutes');
      expect(result.details).toContain('100.0%');
    });

    it('should score partial time on favorite role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // 60 min on role 1 (favorite)
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // 60 min on role 2 (not favorite)
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: 1, 
          preferenceType: 'FAVORITE', 
          baseWeight: 1, 
          crewWeight: 2, 
          adaptiveBoost: 1.0 
        }
      ];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      // Score = 60 minutes * (1 * 2 * 1.0) = 60 * 2 = 120
      expect(result.score).toBe(120);
      expect(result.details).toContain('60/120 minutes');
      expect(result.details).toContain('50.0%');
    });

    it('should not score when no time on favorite role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 }, // Wrong role
        { crewId: 'CREW001', roleId: 3, startMinutes: 540, endMinutes: 600 }, // Wrong role
      ];
      
      const preferences: PreferenceConfig[] = [
        { 
          crewId: 'CREW001', 
          roleId: 1, 
          preferenceType: 'FAVORITE', 
          baseWeight: 5, 
          crewWeight: 5, 
          adaptiveBoost: 1.0 
        }
      ];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      expect(result.score).toBe(0);
      expect(result.details).toContain('0/120 minutes');
      expect(result.details).toContain('0.0%');
    });

    it('should score multiple crew preferences independently', () => {
      const assignments: SolverAssignment[] = [
        // CREW001: 90 min on role 1, 30 min on role 2
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 570 }, 
        { crewId: 'CREW001', roleId: 2, startMinutes: 570, endMinutes: 600 },
        
        // CREW002: 60 min on role 2, 60 min on role 3
        { crewId: 'CREW002', roleId: 2, startMinutes: 540, endMinutes: 600 },
        { crewId: 'CREW002', roleId: 3, startMinutes: 600, endMinutes: 660 },
        
        // CREW003: all on role 3 (100%)
        { crewId: 'CREW003', roleId: 3, startMinutes: 600, endMinutes: 720 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 }, // 90 min
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 2, crewWeight: 1, adaptiveBoost: 1.0 }, // 60 min
        { crewId: 'CREW003', roleId: 3, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 3, adaptiveBoost: 1.0 }, // 120 min
      ];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      // CREW001: 90 * (1 * 1 * 1) = 90
      // CREW002: 60 * (2 * 1 * 1) = 120
      // CREW003: 120 * (1 * 3 * 1) = 360
      expect(result.score).toBe(570);
    });

    it('should handle null roleId as "any role" preference', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 5, startMinutes: 480, endMinutes: 540 }, // Any role counts
        { crewId: 'CREW001', roleId: 99, startMinutes: 540, endMinutes: 600 }, // Any role counts
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: null, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 2, adaptiveBoost: 1.0 }
      ];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      // All 120 minutes count
      expect(result.score).toBe(240); // 120 * (1 * 2 * 1)
      expect(result.details).toContain('120/120 minutes');
      expect(result.details).toContain('100.0%');
    });

    it('should apply adaptiveBoost correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // 60 min
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 10, crewWeight: 5, adaptiveBoost: 2.5 }
      ];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      // Score = 60 * (10 * 5 * 2.5) = 60 * 125 = 7500
      expect(result.score).toBe(7500);
    });

    it('should handle varying assignment durations', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 510 }, // 30 min
        { crewId: 'CREW001', roleId: 1, startMinutes: 510, endMinutes: 600 }, // 90 min
        { crewId: 'CREW001', roleId: 1, startMinutes: 600, endMinutes: 615 }, // 15 min
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 }
      ];
      
      const result = scoreFavoritePreferences(assignments, preferences, crew);
      
      // Total: 30 + 90 + 15 = 135 minutes
      expect(result.score).toBe(135);
    });
  });

  describe('scoreCrewFavorite', () => {
    it('should return 0 score when crew has no assignments', () => {
      const assignments: SolverAssignment[] = [];
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFavorite(preference, assignments);
      
      expect(result.score).toBe(0);
      expect(result.minutesOnFavorite).toBe(0);
      expect(result.totalMinutes).toBe(0);
      expect(result.details).toContain('No assignments');
    });

    it('should score 100% favorite time correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: 'CREW001', roleId: 1, startMinutes: 540, endMinutes: 600 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFavorite(preference, assignments);
      
      expect(result.score).toBe(720); // 120 * (2 * 3 * 1)
      expect(result.minutesOnFavorite).toBe(120);
      expect(result.totalMinutes).toBe(120);
      expect(result.details).toContain('100.0%');
    });

    it('should calculate partial satisfaction correctly', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // 60 min favorite
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 570 }, // 30 min other
        { crewId: 'CREW001', roleId: 1, startMinutes: 570, endMinutes: 600 }, // 30 min favorite
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 1,
        crewWeight: 2,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFavorite(preference, assignments);
      
      // 90 minutes on favorite out of 120 total = 75%
      expect(result.score).toBe(180); // 90 * (1 * 2 * 1)
      expect(result.minutesOnFavorite).toBe(90);
      expect(result.totalMinutes).toBe(120);
      expect(result.details).toContain('75.0%');
    });

    it('should handle other crew assignments (ignore them)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW002', roleId: 1, startMinutes: 420, endMinutes: 480 }, // Different crew
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 }, // Target crew
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const result = scoreCrewFavorite(preference, assignments);
      
      expect(result.score).toBe(60);
      expect(result.minutesOnFavorite).toBe(60);
      expect(result.totalMinutes).toBe(60);
    });
  });

  describe('getFavoriteSatisfactionSummary', () => {
    it('should provide comprehensive satisfaction statistics', () => {
      const assignments: SolverAssignment[] = [
        // CREW001: 100% on role 1
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
        
        // CREW002: 50% on role 2
        { crewId: 'CREW002', roleId: 2, startMinutes: 540, endMinutes: 570 },
        { crewId: 'CREW002', roleId: 1, startMinutes: 570, endMinutes: 600 },
        
        // CREW003: 0% on role 3
        { crewId: 'CREW003', roleId: 2, startMinutes: 600, endMinutes: 660 },
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 1, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW002', roleId: 2, preferenceType: 'FAVORITE', baseWeight: 2, crewWeight: 1, adaptiveBoost: 1.0 },
        { crewId: 'CREW003', roleId: 3, preferenceType: 'FAVORITE', baseWeight: 3, crewWeight: 1, adaptiveBoost: 1.0 },
      ];
      
      const summary = getFavoriteSatisfactionSummary(assignments, preferences, crew);
      
      expect(summary.totalPreferences).toBe(3);
      expect(summary.totalMinutesOnFavorite).toBe(90); // 60 + 30 + 0
      expect(summary.totalMinutesPossible).toBe(180); // 60 + 60 + 60
      expect(summary.overallSatisfactionRate).toBeCloseTo(0.5, 2); // 90/180
      expect(summary.crewDetails).toHaveLength(3);
      expect(summary.crewDetails[0].satisfactionRate).toBe(1.0); // 100%
      expect(summary.crewDetails[1].satisfactionRate).toBe(0.5); // 50%
      expect(summary.crewDetails[2].satisfactionRate).toBe(0.0); // 0%
    });

    it('should handle empty preferences', () => {
      const assignments: SolverAssignment[] = [];
      const preferences: PreferenceConfig[] = [];
      
      const summary = getFavoriteSatisfactionSummary(assignments, preferences, crew);
      
      expect(summary.totalPreferences).toBe(0);
      expect(summary.totalScore).toBe(0);
      expect(summary.totalMinutesOnFavorite).toBe(0);
      expect(summary.totalMinutesPossible).toBe(0);
      expect(summary.overallSatisfactionRate).toBe(0);
    });

    it('should show crew details with accurate statistics', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 510 }, // 30 min favorite
        { crewId: 'CREW001', roleId: 2, startMinutes: 510, endMinutes: 540 }, // 30 min other
      ];
      
      const preferences: PreferenceConfig[] = [
        { crewId: 'CREW001', roleId: 1, preferenceType: 'FAVORITE', baseWeight: 5, crewWeight: 2, adaptiveBoost: 1.0 }
      ];
      
      const summary = getFavoriteSatisfactionSummary(assignments, preferences, crew);
      
      expect(summary.crewDetails[0].minutesOnFavorite).toBe(30);
      expect(summary.crewDetails[0].totalMinutes).toBe(60);
      expect(summary.crewDetails[0].satisfactionRate).toBe(0.5);
      expect(summary.crewDetails[0].score).toBe(300); // 30 * (5 * 2 * 1)
    });
  });

  describe('getAssignmentFavoriteScore', () => {
    it('should return score when assignment matches preference', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 540 // 60 minutes
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const score = getAssignmentFavoriteScore(assignment, preference);
      
      expect(score).toBe(360); // 60 * (2 * 3 * 1)
    });

    it('should return 0 when assignment is for different crew', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW002',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const score = getAssignmentFavoriteScore(assignment, preference);
      
      expect(score).toBe(0);
    });

    it('should return 0 when assignment is for wrong role', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 2,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const score = getAssignmentFavoriteScore(assignment, preference);
      
      expect(score).toBe(0);
    });

    it('should handle null roleId (any role)', () => {
      const assignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 99,
        startMinutes: 480,
        endMinutes: 540
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'FAVORITE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      const score = getAssignmentFavoriteScore(assignment, preference);
      
      expect(score).toBe(60); // 60 * (1 * 1 * 1)
    });

    it('should scale with assignment duration', () => {
      const shortAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 510 // 30 minutes
      };
      
      const longAssignment: SolverAssignment = {
        crewId: 'CREW001',
        roleId: 1,
        startMinutes: 480,
        endMinutes: 600 // 120 minutes
      };
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      expect(getAssignmentFavoriteScore(shortAssignment, preference)).toBe(30);
      expect(getAssignmentFavoriteScore(longAssignment, preference)).toBe(120);
    });
  });

  describe('getPotentialFavoriteScore', () => {
    it('should calculate potential score for all crew assignments', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 }, // Currently other role
        { crewId: 'CREW001', roleId: 2, startMinutes: 540, endMinutes: 600 }, // Currently other role
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      // If all 120 minutes were on favorite role
      const potential = getPotentialFavoriteScore('CREW001', 1, assignments, preference);
      
      expect(potential).toBe(720); // 120 * (2 * 3 * 1)
    });

    it('should return 0 for different crew', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const potential = getPotentialFavoriteScore('CREW002', 1, assignments, preference);
      
      expect(potential).toBe(0);
    });

    it('should return 0 for wrong role', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: 1,
        preferenceType: 'FAVORITE',
        baseWeight: 2,
        crewWeight: 3,
        adaptiveBoost: 1.0
      };
      
      const potential = getPotentialFavoriteScore('CREW001', 2, assignments, preference);
      
      expect(potential).toBe(0);
    });

    it('should handle null roleId (any role)', () => {
      const assignments: SolverAssignment[] = [
        { crewId: 'CREW001', roleId: 2, startMinutes: 480, endMinutes: 540 },
      ];
      
      const preference: PreferenceConfig = {
        crewId: 'CREW001',
        roleId: null,
        preferenceType: 'FAVORITE',
        baseWeight: 1,
        crewWeight: 1,
        adaptiveBoost: 1.0
      };
      
      // Any role counts
      const potential = getPotentialFavoriteScore('CREW001', 99, assignments, preference);
      
      expect(potential).toBe(60);
    });
  });
});
