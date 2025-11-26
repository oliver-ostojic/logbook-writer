import type { ValidationResult, SolverAssignment } from '../types';

/**
 * Window coverage requirement for COVERAGE_WINDOW roles
 */
export interface WindowCoverageRequirement {
  startHour: number;      // Start of coverage window (0-23)
  endHour: number;        // End of coverage window (0-23, exclusive)
  requiredPerHour: number; // N crew needed during EVERY hour in the window
}

/**
 * Validates that assignments for a role meet window coverage requirements.
 * Used for COVERAGE_WINDOW assignment model (e.g., "1 crew on Demo between 10am-7pm").
 * 
 * Rules:
 * - For EVERY hour in the window [startHour, endHour), must have requiredPerHour crew
 * - Unlike HourlyCoverage, this is a continuous window, not individual hours
 * 
 * Example:
 * - Requirement: Demo 10am-7pm, 1 crew per hour
 * - Must have at least 1 crew working during: 10-11am, 11am-12pm, 12-1pm, 1-2pm, etc.
 * - Valid: One crew 10am-7pm (covers all hours)
 * - Invalid: One crew 10am-3pm (missing coverage 3-7pm)
 * 
 * @param assignments - All assignments for this role on this date
 * @param requirement - Window coverage requirement (from WindowRoleConstraint table)
 * @param roleCode - Role code for error messages
 * @returns Validation result with violations for any uncovered hours
 */
export function validateWindowCoverage(
  assignments: SolverAssignment[],
  requirement: WindowCoverageRequirement,
  roleCode: string
): ValidationResult {
  const violations: string[] = [];

  // Check each hour in the window
  for (let hour = requirement.startHour; hour < requirement.endHour; hour++) {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;

    const crewCount = countCrewDuringHour(assignments, hourStart, hourEnd);

    if (crewCount < requirement.requiredPerHour) {
      violations.push(
        `Role '${roleCode}' at ${formatHour(hour)}: understaffed with ${crewCount} crew (need ${requirement.requiredPerHour})`
      );
    } else if (crewCount > requirement.requiredPerHour) {
      violations.push(
        `Role '${roleCode}' at ${formatHour(hour)}: overstaffed with ${crewCount} crew (need ${requirement.requiredPerHour})`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Count how many unique crew members are working during a specific hour.
 * A crew member counts if their assignment overlaps with the hour at all.
 */
function countCrewDuringHour(
  assignments: SolverAssignment[],
  hourStart: number,
  hourEnd: number
): number {
  const crewInHour = new Set<string>();

  for (const assignment of assignments) {
    // Check if assignment overlaps with this hour
    if (assignment.startMinutes < hourEnd && assignment.endMinutes > hourStart) {
      crewInHour.add(assignment.crewId);
    }
  }

  return crewInHour.size;
}

/**
 * Get coverage summary for the window.
 * Returns coverage for each hour in the window.
 */
export function getWindowCoverageSummary(
  assignments: SolverAssignment[],
  requirement: WindowCoverageRequirement
): Map<number, { actual: number; required: number }> {
  const coverage = new Map<number, { actual: number; required: number }>();

  for (let hour = requirement.startHour; hour < requirement.endHour; hour++) {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    const actual = countCrewDuringHour(assignments, hourStart, hourEnd);

    coverage.set(hour, {
      actual,
      required: requirement.requiredPerHour,
    });
  }

  return coverage;
}

/**
 * Check if the window is fully covered (all hours have required crew).
 */
export function isWindowFullyCovered(
  assignments: SolverAssignment[],
  requirement: WindowCoverageRequirement
): boolean {
  for (let hour = requirement.startHour; hour < requirement.endHour; hour++) {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    const crewCount = countCrewDuringHour(assignments, hourStart, hourEnd);

    if (crewCount < requirement.requiredPerHour) {
      return false;
    }
  }

  return true;
}

/**
 * Helper to format hour as readable time
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}
