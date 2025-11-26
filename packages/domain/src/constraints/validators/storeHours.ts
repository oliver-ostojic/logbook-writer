import type { ValidationResult, SolverAssignment, StoreConfig, RoleConfig } from '../types';

/**
 * Validates that assignment times respect store operating hours.
 * 
 * Rules:
 * - If role.allowOutsideStoreHours = false: assignment must be entirely within store hours
 * - If role.allowOutsideStoreHours = true: assignment can extend outside store hours
 * 
 * Example:
 * - Store hours: 8:00 AM (480 min) to 9:00 PM (1260 min)
 * - Regular role (allowOutsideStoreHours = false): 
 *   ✓ 8:00 AM - 5:00 PM (within hours)
 *   ✗ 7:00 AM - 3:00 PM (starts before store opens)
 * - Setup role (allowOutsideStoreHours = true):
 *   ✓ 7:00 AM - 3:00 PM (allowed to start early)
 * 
 * @param assignment - The assignment to validate
 * @param store - Store configuration with operating hours
 * @param role - Role configuration with allowOutsideStoreHours flag
 * @returns Validation result with any violations
 */
export function validateStoreHours(
  assignment: SolverAssignment,
  store: StoreConfig,
  role: RoleConfig
): ValidationResult {
  const violations: string[] = [];

  // If role allows outside hours, skip validation
  if (role.allowOutsideStoreHours) {
    return { valid: true, violations: [] };
  }

  // Check if assignment starts before store opens
  if (assignment.startMinutes < store.openMinutesFromMidnight) {
    const startTime = formatMinutesToTime(assignment.startMinutes);
    const openTime = formatMinutesToTime(store.openMinutesFromMidnight);
    violations.push(
      `Assignment starts at ${startTime} before store opens at ${openTime} (role '${role.code}' does not allow outside hours)`
    );
  }

  // Check if assignment ends after store closes
  if (assignment.endMinutes > store.closeMinutesFromMidnight) {
    const endTime = formatMinutesToTime(assignment.endMinutes);
    const closeTime = formatMinutesToTime(store.closeMinutesFromMidnight);
    violations.push(
      `Assignment ends at ${endTime} after store closes at ${closeTime} (role '${role.code}' does not allow outside hours)`
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Helper: Format minutes from midnight to HH:MM AM/PM
 */
export function formatMinutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const displayMins = mins.toString().padStart(2, '0');
  return `${displayHours}:${displayMins} ${period}`;
}

/**
 * Helper: Check if assignment is entirely within store hours
 */
export function isWithinStoreHours(
  assignment: SolverAssignment,
  store: StoreConfig
): boolean {
  return (
    assignment.startMinutes >= store.openMinutesFromMidnight &&
    assignment.endMinutes <= store.closeMinutesFromMidnight
  );
}
