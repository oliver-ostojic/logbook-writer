import { describe, it, expect } from 'vitest';
import {
  validateConsecutiveSlots,
  validateConsecutiveSlotsForCrewRole,
  canMergeIntoConsecutiveBlock,
} from '../../src/constraints/validators/consecutiveSlots';
import type { SolverAssignment, StoreConfig, RoleConfig } from '../../src/constraints/types';

const mockStore: StoreConfig = {
  baseSlotMinutes: 30,
  openMinutesFromMidnight: 480, // 8:00 AM
  closeMinutesFromMidnight: 1260, // 9:00 PM
  reqShiftLengthForBreak: 360,
  breakWindowStart: 180,
  breakWindowEnd: 270,
};

const roleRequiringConsecutive: RoleConfig = {
  id: 1,
  code: 'REGISTER',
  minSlots: 2,
  maxSlots: 16,
  blockSize: 1,
  slotsMustBeConsecutive: true,
  allowOutsideStoreHours: false,
};

const roleAllowingSplit: RoleConfig = {
  id: 2,
  code: 'ORDER_WRITER',
  minSlots: 2,
  maxSlots: 4,
  blockSize: 1,
  slotsMustBeConsecutive: false,
  allowOutsideStoreHours: false,
};

describe('validateConsecutiveSlots', () => {
  it('should pass for role that does not require consecutive slots', () => {
    const assignment: SolverAssignment = {
      crewId: '1234567',
      roleId: 2,
      startMinutes: 540, // 9:00 AM
      endMinutes: 600,   // 10:00 AM
    };

    const result = validateConsecutiveSlots(assignment, mockStore, roleAllowingSplit);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should pass for single consecutive block when required', () => {
    const assignment: SolverAssignment = {
      crewId: '1234567',
      roleId: 1,
      startMinutes: 540, // 9:00 AM
      endMinutes: 600,   // 10:00 AM
    };

    const result = validateConsecutiveSlots(assignment, mockStore, roleRequiringConsecutive);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe('validateConsecutiveSlotsForCrewRole', () => {
  describe('when slotsMustBeConsecutive is false', () => {
    it('should allow single assignment', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 2,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleAllowingSplit);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow split assignments with gaps', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 2,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '1234567',
          roleId: 2,
          startMinutes: 660, // 11:00 AM (1 hour gap)
          endMinutes: 720,   // 12:00 PM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleAllowingSplit);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('when slotsMustBeConsecutive is true', () => {
    it('should allow empty assignments array', () => {
      const result = validateConsecutiveSlotsForCrewRole([], mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow single assignment', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 720,   // 12:00 PM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow perfectly adjacent assignments (no gap)', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 600, // 10:00 AM (exactly where previous ended)
          endMinutes: 660,   // 11:00 AM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject assignments with gap - 1 slot gap', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 630, // 10:30 AM (30 minute gap = 1 slot)
          endMinutes: 690,   // 11:30 AM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('gap of 1 slots');
      expect(result.violations[0]).toContain('600');
      expect(result.violations[0]).toContain('630');
    });

    it('should reject assignments with gap - 2 slot gap', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 660, // 11:00 AM (1 hour gap = 2 slots)
          endMinutes: 720,   // 12:00 PM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('gap of 2 slots');
    });

    it('should reject assignments with gap - large gap', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 900, // 3:00 PM (5 hour gap = 10 slots)
          endMinutes: 960,   // 4:00 PM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('gap of 10 slots');
    });

    it('should handle unsorted assignments correctly', () => {
      // Give assignments in reverse order - validator should sort them
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 660, // 11:00 AM (second chronologically)
          endMinutes: 720,   // 12:00 PM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM (first chronologically)
          endMinutes: 600,   // 10:00 AM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('gap');
    });

    it('should reject overlapping assignments', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 630,   // 10:30 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 600, // 10:00 AM (overlaps with previous)
          endMinutes: 660,   // 11:00 AM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Overlapping assignments');
    });

    it('should allow three consecutive assignments', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 600, // 10:00 AM
          endMinutes: 660,   // 11:00 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 660, // 11:00 AM
          endMinutes: 720,   // 12:00 PM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject three assignments with gap in the middle', () => {
      const assignments: SolverAssignment[] = [
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 540, // 9:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 630, // 10:30 AM (gap after first)
          endMinutes: 690,   // 11:30 AM
        },
        {
          crewId: '1234567',
          roleId: 1,
          startMinutes: 690, // 11:30 AM (consecutive with second)
          endMinutes: 750,   // 12:30 PM
        },
      ];

      const result = validateConsecutiveSlotsForCrewRole(assignments, mockStore, roleRequiringConsecutive);
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('gap');
    });
  });
});

describe('canMergeIntoConsecutiveBlock', () => {
  it('should return true for empty array', () => {
    expect(canMergeIntoConsecutiveBlock([], mockStore)).toBe(true);
  });

  it('should return true for single assignment', () => {
    const assignments: SolverAssignment[] = [
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 600,
      },
    ];
    expect(canMergeIntoConsecutiveBlock(assignments, mockStore)).toBe(true);
  });

  it('should return true for perfectly adjacent assignments', () => {
    const assignments: SolverAssignment[] = [
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 600,
      },
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 600,
        endMinutes: 660,
      },
    ];
    expect(canMergeIntoConsecutiveBlock(assignments, mockStore)).toBe(true);
  });

  it('should return false for assignments with gap', () => {
    const assignments: SolverAssignment[] = [
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 600,
      },
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 630, // Gap here
        endMinutes: 690,
      },
    ];
    expect(canMergeIntoConsecutiveBlock(assignments, mockStore)).toBe(false);
  });

  it('should return false for overlapping assignments', () => {
    const assignments: SolverAssignment[] = [
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 630,
      },
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 600, // Overlap
        endMinutes: 660,
      },
    ];
    expect(canMergeIntoConsecutiveBlock(assignments, mockStore)).toBe(false);
  });

  it('should handle unsorted assignments', () => {
    const assignments: SolverAssignment[] = [
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 600, // Second
        endMinutes: 660,
      },
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 540, // First
        endMinutes: 600,
      },
    ];
    expect(canMergeIntoConsecutiveBlock(assignments, mockStore)).toBe(true);
  });

  it('should return true for three consecutive assignments', () => {
    const assignments: SolverAssignment[] = [
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 540,
        endMinutes: 600,
      },
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 600,
        endMinutes: 660,
      },
      {
        crewId: '1234567',
        roleId: 1,
        startMinutes: 660,
        endMinutes: 720,
      },
    ];
    expect(canMergeIntoConsecutiveBlock(assignments, mockStore)).toBe(true);
  });
});
