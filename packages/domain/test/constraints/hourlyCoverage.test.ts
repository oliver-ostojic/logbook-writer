import { describe, it, expect } from 'vitest';
import {
  validateHourlyCoverage,
  countCrewDuringHour,
  getCoverageByHour,
  type HourlyCoverageRequirement,
} from '../../src/constraints/validators/hourlyCoverage';
import type { SolverAssignment, StoreConfig } from '../../src/constraints/types';

const mockStore: StoreConfig = {
  baseSlotMinutes: 30,
  openMinutesFromMidnight: 480, // 8:00 AM
  closeMinutesFromMidnight: 1260, // 9:00 PM
  reqShiftLengthForBreak: 360,
  breakWindowStart: 180,
  breakWindowEnd: 270,
};

describe('Hourly Coverage Validator', () => {
  describe('validateHourlyCoverage', () => {
    it('should pass when coverage exactly matches requirement', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 2 }, // 8am: need 2 crew
      ];

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480, // 8:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '2222222',
          roleId: 1,
          startMinutes: 480, // 8:00 AM
          endMinutes: 600,   // 10:00 AM
        },
      ];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when understaffed', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 3 }, // Need 3 crew
      ];

      const assignments: SolverAssignment[] = [
        {
          crewId: '1111111',
          roleId: 1,
          startMinutes: 480, // 8:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        {
          crewId: '2222222',
          roleId: 1,
          startMinutes: 480, // 8:00 AM
          endMinutes: 600,   // 10:00 AM
        },
        // Only 2 crew, need 3!
      ];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('understaffed');
      expect(result.violations[0]).toContain('2 crew');
      expect(result.violations[0]).toContain('need 3');
      expect(result.violations[0]).toContain('8:00 AM');
    });

    it('should fail when overstaffed', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 2 }, // Need 2 crew
      ];

      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 600 },
        { crewId: '2222222', roleId: 1, startMinutes: 480, endMinutes: 600 },
        { crewId: '3333333', roleId: 1, startMinutes: 480, endMinutes: 600 },
        // 3 crew, need only 2!
      ];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('overstaffed');
      expect(result.violations[0]).toContain('3 crew');
      expect(result.violations[0]).toContain('need 2');
    });

    it('should validate multiple hours independently', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 2 },  // 8am: need 2
        { hour: 9, requiredPerHour: 3 },  // 9am: need 3
        { hour: 10, requiredPerHour: 2 }, // 10am: need 2
      ];

      const assignments: SolverAssignment[] = [
        // 8-11am: crew1, crew2 (covers all 3 hours)
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 660 },
        { crewId: '2222222', roleId: 1, startMinutes: 480, endMinutes: 660 },
        // 9-10am: crew3 (adds coverage during 9am hour only)
        { crewId: '3333333', roleId: 1, startMinutes: 540, endMinutes: 600 },
      ];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect violations in multiple hours', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 3 },  // Need 3, have 2 → understaffed
        { hour: 9, requiredPerHour: 2 },  // Need 2, have 3 → overstaffed
      ];

      const assignments: SolverAssignment[] = [
        // 8-10am: crew1, crew2
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 600 },
        { crewId: '2222222', roleId: 1, startMinutes: 480, endMinutes: 600 },
        // 9-10am: crew3
        { crewId: '3333333', roleId: 1, startMinutes: 540, endMinutes: 600 },
      ];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
      expect(result.violations[0]).toContain('8:00 AM');
      expect(result.violations[0]).toContain('understaffed');
      expect(result.violations[1]).toContain('9:00 AM');
      expect(result.violations[1]).toContain('overstaffed');
    });

    it('should handle zero requirements (no coverage needed)', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 0 },
      ];

      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 600 },
      ];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('overstaffed');
      expect(result.violations[0]).toContain('1 crew');
      expect(result.violations[0]).toContain('need 0');
    });

    it('should pass when no assignments for hour with zero requirement', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 0 },
      ];

      const assignments: SolverAssignment[] = [];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(true);
    });

    it('should handle partial hour coverage correctly', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 2 },
      ];

      const assignments: SolverAssignment[] = [
        // 7:30-8:30 (covers last 30min of 7am hour and first 30min of 8am hour)
        { crewId: '1111111', roleId: 1, startMinutes: 450, endMinutes: 510 },
        // 8:15-9:00 (covers last 45min of 8am hour)
        { crewId: '2222222', roleId: 1, startMinutes: 495, endMinutes: 540 },
      ];

      // Both crew overlap with the 8am hour, so count = 2
      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(true);
    });

    it('should handle assignments that span multiple hours', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 1 },
        { hour: 9, requiredPerHour: 1 },
        { hour: 10, requiredPerHour: 1 },
      ];

      const assignments: SolverAssignment[] = [
        // Single crew working 8am-11am covers all three hours
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 660 },
      ];

      const result = validateHourlyCoverage(assignments, requirements, mockStore, 'REGISTER');
      expect(result.valid).toBe(true);
    });
  });

  describe('countCrewDuringHour', () => {
    it('should count crew working full hour', () => {
      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: '2222222', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const count = countCrewDuringHour(assignments, 480, 540); // 8:00-9:00
      expect(count).toBe(2);
    });

    it('should count crew working partial hour', () => {
      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 450, endMinutes: 510 }, // 7:30-8:30
        { crewId: '2222222', roleId: 1, startMinutes: 520, endMinutes: 600 }, // 8:40-10:00
      ];

      const count = countCrewDuringHour(assignments, 480, 540); // 8:00-9:00
      expect(count).toBe(2);
    });

    it('should not count crew working before hour', () => {
      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 420, endMinutes: 480 }, // 7:00-8:00 (ends at hour start)
      ];

      const count = countCrewDuringHour(assignments, 480, 540); // 8:00-9:00
      expect(count).toBe(0);
    });

    it('should not count crew working after hour', () => {
      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 540, endMinutes: 600 }, // 9:00-10:00 (starts at hour end)
      ];

      const count = countCrewDuringHour(assignments, 480, 540); // 8:00-9:00
      expect(count).toBe(0);
    });

    it('should not double-count same crew with multiple assignments', () => {
      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 510 }, // 8:00-8:30
        { crewId: '1111111', roleId: 1, startMinutes: 510, endMinutes: 540 }, // 8:30-9:00
      ];

      const count = countCrewDuringHour(assignments, 480, 540); // 8:00-9:00
      expect(count).toBe(1); // Same crew, counted once
    });

    it('should return zero for no assignments', () => {
      const count = countCrewDuringHour([], 480, 540);
      expect(count).toBe(0);
    });
  });

  describe('getCoverageByHour', () => {
    it('should return coverage summary for all required hours', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 2 },
        { hour: 9, requiredPerHour: 3 },
      ];

      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 600 },
        { crewId: '2222222', roleId: 1, startMinutes: 480, endMinutes: 600 },
        { crewId: '3333333', roleId: 1, startMinutes: 540, endMinutes: 600 },
      ];

      const coverage = getCoverageByHour(assignments, requirements);

      expect(coverage.size).toBe(2);
      expect(coverage.get(8)).toEqual({ actual: 2, required: 2 });
      expect(coverage.get(9)).toEqual({ actual: 3, required: 3 });
    });

    it('should show discrepancies in coverage', () => {
      const requirements: HourlyCoverageRequirement[] = [
        { hour: 8, requiredPerHour: 5 },
      ];

      const assignments: SolverAssignment[] = [
        { crewId: '1111111', roleId: 1, startMinutes: 480, endMinutes: 540 },
        { crewId: '2222222', roleId: 1, startMinutes: 480, endMinutes: 540 },
      ];

      const coverage = getCoverageByHour(assignments, requirements);

      expect(coverage.get(8)).toEqual({ actual: 2, required: 5 });
    });
  });
});
