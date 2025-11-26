import type { ValidationResult, SolverAssignment } from '../types';

/**
 * Validates that no crew member has overlapping assignments.
 * 
 * Rules:
 * - A crew member cannot be assigned to multiple roles at the same time
 * - Two assignments overlap if: startA < endB AND endA > startB
 * - Assignments that end exactly when another begins are NOT overlapping (handoff is allowed)
 * 
 * Example:
 * - Valid: 8:00-10:00, then 10:00-12:00 (handoff at 10:00)
 * - Invalid: 8:00-10:00, then 9:00-11:00 (overlap 9:00-10:00)
 * 
 * @param assignments - All assignments to validate
 * @returns Validation result with violations for any overlapping assignments
 */
export function validateNoOverlappingShifts(
  assignments: SolverAssignment[]
): ValidationResult {
  const violations: string[] = [];

  // Group assignments by crew
  const assignmentsByCrew = new Map<string, SolverAssignment[]>();
  for (const assignment of assignments) {
    const crewAssignments = assignmentsByCrew.get(assignment.crewId) || [];
    crewAssignments.push(assignment);
    assignmentsByCrew.set(assignment.crewId, crewAssignments);
  }

  // Check each crew's assignments for overlaps
  for (const [crewId, crewAssignments] of assignmentsByCrew) {
    // Sort by start time for easier checking
    const sorted = [...crewAssignments].sort((a, b) => a.startMinutes - b.startMinutes);

    // Check each pair of assignments
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];

        // Check if they overlap
        // Overlap occurs if: a.start < b.end AND a.end > b.start
        if (a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes) {
          const overlapStart = Math.max(a.startMinutes, b.startMinutes);
          const overlapEnd = Math.min(a.endMinutes, b.endMinutes);
          const overlapDuration = overlapEnd - overlapStart;

          violations.push(
            `Crew '${crewId}' has overlapping assignments: ` +
            `[${formatMinutes(a.startMinutes)}-${formatMinutes(a.endMinutes)} roleId:${a.roleId}] ` +
            `overlaps with ` +
            `[${formatMinutes(b.startMinutes)}-${formatMinutes(b.endMinutes)} roleId:${b.roleId}] ` +
            `(overlap: ${formatMinutes(overlapStart)}-${formatMinutes(overlapEnd)}, ${overlapDuration}min)`
          );
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Check if two assignments overlap.
 * Returns true if they overlap, false if they don't (including exact handoffs).
 */
export function doAssignmentsOverlap(
  a: SolverAssignment,
  b: SolverAssignment
): boolean {
  // Must be same crew to overlap
  if (a.crewId !== b.crewId) {
    return false;
  }

  // Overlap if: a.start < b.end AND a.end > b.start
  return a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes;
}

/**
 * Find all overlapping assignment pairs for a crew.
 */
export function findOverlaps(
  assignments: SolverAssignment[]
): Array<{ a: SolverAssignment; b: SolverAssignment }> {
  const overlaps: Array<{ a: SolverAssignment; b: SolverAssignment }> = [];

  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      if (doAssignmentsOverlap(assignments[i], assignments[j])) {
        overlaps.push({ a: assignments[i], b: assignments[j] });
      }
    }
  }

  return overlaps;
}

/**
 * Get assignments for a specific crew, sorted by start time.
 */
export function getCrewAssignments(
  crewId: string,
  assignments: SolverAssignment[]
): SolverAssignment[] {
  return assignments
    .filter(a => a.crewId === crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

/**
 * Check if adding a new assignment would create an overlap.
 */
export function wouldCreateOverlap(
  newAssignment: SolverAssignment,
  existingAssignments: SolverAssignment[]
): boolean {
  const crewAssignments = existingAssignments.filter(
    a => a.crewId === newAssignment.crewId
  );

  return crewAssignments.some(existing => doAssignmentsOverlap(newAssignment, existing));
}

/**
 * Helper to format minutes as readable time
 */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours < 12 ? 'AM' : 'PM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${mins.toString().padStart(2, '0')}${period}`;
}
