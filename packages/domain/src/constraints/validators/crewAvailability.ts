import type { ValidationResult, SolverAssignment } from '../types';

/**
 * Crew availability window (from Crew.cachedShiftStartMin and cachedShiftEndMin)
 */
export interface CrewAvailability {
  crewId: string;
  shiftStartMin: number; // Earliest time crew can work (minutes from midnight)
  shiftEndMin: number;   // Latest time crew can work (minutes from midnight)
}

/**
 * Validates that all assignments respect crew availability windows.
 * 
 * Rules:
 * - Assignment start time must be >= crew's shiftStartMin
 * - Assignment end time must be <= crew's shiftEndMin
 * - No part of the assignment can fall outside the crew's availability window
 * 
 * Example:
 * - Crew available: 8:00 AM - 2:00 PM (480 - 840 minutes)
 * - Valid: 8:00-10:00, 10:00-2:00, 12:00-2:00
 * - Invalid: 7:00-9:00 (starts too early), 1:00-3:00 (ends too late), 7:00-3:00 (both)
 * 
 * @param assignments - All assignments to validate
 * @param availabilities - Crew availability windows (from Crew table)
 * @returns Validation result with violations for assignments outside availability
 */
export function validateCrewAvailability(
  assignments: SolverAssignment[],
  availabilities: CrewAvailability[]
): ValidationResult {
  const violations: string[] = [];

  // Build availability map for fast lookup
  const availabilityMap = new Map<string, CrewAvailability>();
  for (const avail of availabilities) {
    availabilityMap.set(avail.crewId, avail);
  }

  // Check each assignment
  for (const assignment of assignments) {
    const availability = availabilityMap.get(assignment.crewId);
    
    if (!availability) {
      // No availability record = crew cannot work at all
      violations.push(
        `Crew '${assignment.crewId}' has no availability window defined (assignment: ${formatMinutes(assignment.startMinutes)}-${formatMinutes(assignment.endMinutes)})`
      );
      continue;
    }

    // Check if assignment is within availability window
    if (assignment.startMinutes < availability.shiftStartMin) {
      violations.push(
        `Crew '${assignment.crewId}' assignment starts at ${formatMinutes(assignment.startMinutes)}, ` +
        `but crew is only available from ${formatMinutes(availability.shiftStartMin)} ` +
        `(starts ${availability.shiftStartMin - assignment.startMinutes}min too early)`
      );
    }

    if (assignment.endMinutes > availability.shiftEndMin) {
      violations.push(
        `Crew '${assignment.crewId}' assignment ends at ${formatMinutes(assignment.endMinutes)}, ` +
        `but crew is only available until ${formatMinutes(availability.shiftEndMin)} ` +
        `(ends ${assignment.endMinutes - availability.shiftEndMin}min too late)`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Check if a specific assignment fits within crew's availability.
 */
export function isAssignmentWithinAvailability(
  assignment: SolverAssignment,
  availability: CrewAvailability
): boolean {
  return (
    assignment.crewId === availability.crewId &&
    assignment.startMinutes >= availability.shiftStartMin &&
    assignment.endMinutes <= availability.shiftEndMin
  );
}

/**
 * Get the valid assignment window for a crew member.
 */
export function getAvailabilityWindow(
  crewId: string,
  availabilities: CrewAvailability[]
): CrewAvailability | undefined {
  return availabilities.find(a => a.crewId === crewId);
}

/**
 * Calculate how much of an assignment falls outside availability window.
 */
export function getAvailabilityViolationMinutes(
  assignment: SolverAssignment,
  availability: CrewAvailability
): { earlyMinutes: number; lateMinutes: number; totalViolation: number } {
  let earlyMinutes = 0;
  let lateMinutes = 0;

  if (assignment.startMinutes < availability.shiftStartMin) {
    earlyMinutes = availability.shiftStartMin - assignment.startMinutes;
  }

  if (assignment.endMinutes > availability.shiftEndMin) {
    lateMinutes = assignment.endMinutes - availability.shiftEndMin;
  }

  return {
    earlyMinutes,
    lateMinutes,
    totalViolation: earlyMinutes + lateMinutes,
  };
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
