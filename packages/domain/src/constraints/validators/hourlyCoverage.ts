import type { ValidationResult, SolverAssignment, StoreConfig } from '../types';

/**
 * Hourly coverage requirement for UNIVERSAL roles
 */
export interface HourlyCoverageRequirement {
  hour: number;           // 0-23
  requiredPerHour: number; // N crew needed during this hour
}

/**
 * Validates that assignments for a role meet hourly coverage requirements.
 * Used for UNIVERSAL assignment model (e.g., "7 crew on Register at 8am").
 * 
 * Rules:
 * - For each hour with a requirement, count how many crew are assigned
 * - The count must equal requiredPerHour (exactly N crew)
 * 
 * Example:
 * - Requirement: 8am requires 7 crew
 * - Assignments: If 6 crew are scheduled 8-9am → VIOLATION (need 1 more)
 * - Assignments: If 8 crew are scheduled 8-9am → VIOLATION (1 too many)
 * - Assignments: If 7 crew are scheduled 8-9am → VALID
 * 
 * @param assignments - All assignments for this role on this date
 * @param requirements - Hourly coverage requirements (from HourlyRoleConstraint table)
 * @param store - Store configuration (for time calculations)
 * @param roleCode - Role code for error messages
 * @returns Validation result with violations for under/over staffing
 */
export function validateHourlyCoverage(
  assignments: SolverAssignment[],
  requirements: HourlyCoverageRequirement[],
  store: StoreConfig,
  roleCode: string
): ValidationResult {
  const violations: string[] = [];

  // For each hour with a requirement, count assigned crew
  for (const req of requirements) {
    const hourStart = req.hour * 60; // Convert hour to minutes from midnight
    const hourEnd = hourStart + 60;

    // Count how many crew are working during this hour
    const crewCount = countCrewDuringHour(assignments, hourStart, hourEnd);

    if (crewCount < req.requiredPerHour) {
      violations.push(
        `Role '${roleCode}' at ${formatHour(req.hour)}: understaffed with ${crewCount} crew (need ${req.requiredPerHour})`
      );
    } else if (crewCount > req.requiredPerHour) {
      violations.push(
        `Role '${roleCode}' at ${formatHour(req.hour)}: overstaffed with ${crewCount} crew (need ${req.requiredPerHour})`
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
export function countCrewDuringHour(
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
 * Get coverage counts for all hours with requirements.
 * Useful for debugging and reporting.
 */
export function getCoverageByHour(
  assignments: SolverAssignment[],
  requirements: HourlyCoverageRequirement[]
): Map<number, { actual: number; required: number }> {
  const coverage = new Map<number, { actual: number; required: number }>();

  for (const req of requirements) {
    const hourStart = req.hour * 60;
    const hourEnd = hourStart + 60;
    const actual = countCrewDuringHour(assignments, hourStart, hourEnd);

    coverage.set(req.hour, {
      actual,
      required: req.requiredPerHour,
    });
  }

  return coverage;
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
