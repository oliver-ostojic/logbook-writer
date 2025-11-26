import type { ValidationResult, SolverAssignment } from '../types';

/**
 * Daily hours requirement for CREW_SPECIFIC roles
 */
export interface DailyHoursRequirement {
  crewId: string;         // Specific crew member
  requiredHours: number;  // Exact hours this crew must work on this role
}

/**
 * Validates that a specific crew member works exactly the required hours on a role.
 * Used for CREW_SPECIFIC assignment model (e.g., "Crew A must do 1.5hrs of Order Writing").
 * 
 * Rules:
 * - Sum of all assignments for this crew on this role must equal requiredHours
 * - Not more, not less - exactly the required amount
 * 
 * Example:
 * - Requirement: Crew "1234567" must work 1.5 hours on Order Writer role
 * - Valid: One 1.5hr assignment OR three 30min assignments (total 1.5hrs)
 * - Invalid: 1hr assignment (too little) OR 2hr assignment (too much)
 * 
 * @param assignments - All assignments for this crew on this role on this date
 * @param requirement - Daily hours requirement (from DailyRoleConstraint table)
 * @param roleCode - Role code for error messages
 * @returns Validation result with violations if hours don't match exactly
 */
export function validateDailyHours(
  assignments: SolverAssignment[],
  requirement: DailyHoursRequirement,
  roleCode: string
): ValidationResult {
  const violations: string[] = [];

  // Filter to only this crew's assignments
  const crewAssignments = assignments.filter(a => a.crewId === requirement.crewId);

  // Calculate total hours worked
  const totalMinutes = crewAssignments.reduce((sum, assignment) => {
    return sum + (assignment.endMinutes - assignment.startMinutes);
  }, 0);

  const totalHours = totalMinutes / 60;
  const requiredHours = requirement.requiredHours;

  // Check if hours match exactly
  if (Math.abs(totalHours - requiredHours) > 0.001) { // Use small epsilon for float comparison
    if (totalHours < requiredHours) {
      violations.push(
        `Crew '${requirement.crewId}' on role '${roleCode}': worked ${totalHours}hr (need exactly ${requiredHours}hr) - UNDER by ${requiredHours - totalHours}hr`
      );
    } else {
      violations.push(
        `Crew '${requirement.crewId}' on role '${roleCode}': worked ${totalHours}hr (need exactly ${requiredHours}hr) - OVER by ${totalHours - requiredHours}hr`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Get hours breakdown for a crew on a role.
 * Useful for debugging and reporting.
 */
export function getHoursSummary(
  assignments: SolverAssignment[],
  crewId: string
): {
  totalHours: number;
  assignmentCount: number;
  assignments: Array<{ startMinutes: number; endMinutes: number; hours: number }>;
} {
  const crewAssignments = assignments.filter(a => a.crewId === crewId);

  const totalMinutes = crewAssignments.reduce((sum, assignment) => {
    return sum + (assignment.endMinutes - assignment.startMinutes);
  }, 0);

  return {
    totalHours: totalMinutes / 60,
    assignmentCount: crewAssignments.length,
    assignments: crewAssignments.map(a => ({
      startMinutes: a.startMinutes,
      endMinutes: a.endMinutes,
      hours: (a.endMinutes - a.startMinutes) / 60,
    })),
  };
}

/**
 * Validate multiple crew members' daily hours at once.
 * Useful for validating all DailyRoleConstraints for a role on a date.
 */
export function validateMultipleDailyHours(
  assignments: SolverAssignment[],
  requirements: DailyHoursRequirement[],
  roleCode: string
): ValidationResult {
  const allViolations: string[] = [];

  for (const requirement of requirements) {
    const result = validateDailyHours(assignments, requirement, roleCode);
    allViolations.push(...result.violations);
  }

  return {
    valid: allViolations.length === 0,
    violations: allViolations,
  };
}
