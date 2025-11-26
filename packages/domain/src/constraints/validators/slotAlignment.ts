import type { ValidationResult, SolverAssignment, StoreConfig } from '../types';

/**
 * Validates that assignment times align to the store's base slot boundaries.
 * 
 * For example, if baseSlotMinutes = 30:
 * - Valid: 480 (8:00 AM), 510 (8:30 AM), 540 (9:00 AM)
 * - Invalid: 485 (8:05 AM), 495 (8:15 AM)
 * 
 * @param assignment - The assignment to validate
 * @param store - Store configuration with baseSlotMinutes
 * @returns Validation result with any violations
 */
export function validateSlotAlignment(
  assignment: SolverAssignment,
  store: StoreConfig
): ValidationResult {
  const violations: string[] = [];

  // Check if start time aligns to slot boundary
  if (assignment.startMinutes % store.baseSlotMinutes !== 0) {
    violations.push(
      `Start time ${assignment.startMinutes} does not align to ${store.baseSlotMinutes}-minute slot boundary`
    );
  }

  // Check if end time aligns to slot boundary
  if (assignment.endMinutes % store.baseSlotMinutes !== 0) {
    violations.push(
      `End time ${assignment.endMinutes} does not align to ${store.baseSlotMinutes}-minute slot boundary`
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Helper: Convert minutes from midnight to slot index
 */
export function minutesToSlotIndex(minutes: number, baseSlotMinutes: number): number {
  return Math.floor(minutes / baseSlotMinutes);
}

/**
 * Helper: Convert slot index to minutes from midnight
 */
export function slotIndexToMinutes(slotIndex: number, baseSlotMinutes: number): number {
  return slotIndex * baseSlotMinutes;
}

/**
 * Helper: Calculate duration in slots
 */
export function calculateSlotsForAssignment(
  assignment: SolverAssignment,
  baseSlotMinutes: number
): number {
  const durationMinutes = assignment.endMinutes - assignment.startMinutes;
  return durationMinutes / baseSlotMinutes;
}
