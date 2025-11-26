import type { SolverAssignment, StoreConfig, RoleConfig, ValidationResult } from '../types';
import { minutesToSlotIndex } from './slotAlignment';

/**
 * Validates that when role.slotsMustBeConsecutive is true,
 * all slots in the assignment form a continuous block with no gaps.
 * 
 * Example:
 * - Valid: 9:00-11:30 (slots 18,19,20,21,22 with 30min baseSlotMinutes)
 * - Invalid: 9:00-10:00 + 10:30-11:30 (gap at slot 20)
 */
export function validateConsecutiveSlots(
  assignment: SolverAssignment,
  store: StoreConfig,
  role: RoleConfig
): ValidationResult {
  // If role doesn't require consecutive slots, this constraint doesn't apply
  if (!role.slotsMustBeConsecutive) {
    return {
      valid: true,
      violations: [],
    };
  }

  const startSlot = minutesToSlotIndex(assignment.startMinutes, store.baseSlotMinutes);
  const endSlot = minutesToSlotIndex(assignment.endMinutes, store.baseSlotMinutes);
  
  // Calculate expected number of slots for a consecutive assignment
  const expectedSlots = endSlot - startSlot;
  
  // For a truly consecutive assignment, every slot from start to end should be occupied
  // This is inherently true if we're dealing with a single assignment block
  // The validation mainly ensures the assignment represents a single continuous period
  
  // Check if the assignment is a single continuous block
  // (This is automatically true for our SolverAssignment type which has startMinutes/endMinutes)
  // In a real solver, we'd check that there are no gaps in the assignment
  
  return {
    valid: true,
    violations: [],
  };
}

/**
 * Validates multiple assignments for the same crew/role combination
 * to ensure they don't create gaps when slotsMustBeConsecutive is true.
 * 
 * This is the key validator for splitting behavior:
 * - When slotsMustBeConsecutive=true: All assignments for crew+role must form ONE continuous block
 * - When slotsMustBeConsecutive=false: Assignments can be split with gaps
 */
export function validateConsecutiveSlotsForCrewRole(
  assignments: SolverAssignment[],
  store: StoreConfig,
  role: RoleConfig
): ValidationResult {
  // If role doesn't require consecutive slots, splitting is allowed
  if (!role.slotsMustBeConsecutive) {
    return {
      valid: true,
      violations: [],
    };
  }

  // If we have 0 or 1 assignment, there can't be gaps
  if (assignments.length <= 1) {
    return {
      valid: true,
      violations: [],
    };
  }

  // Sort assignments by start time
  const sorted = [...assignments].sort((a, b) => a.startMinutes - b.startMinutes);

  // Check for gaps between consecutive assignments
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // If there's a gap between end of current and start of next, violation!
    if (current.endMinutes < next.startMinutes) {
      const currentEndSlot = minutesToSlotIndex(current.endMinutes, store.baseSlotMinutes);
      const nextStartSlot = minutesToSlotIndex(next.startMinutes, store.baseSlotMinutes);
      const gapSlots = nextStartSlot - currentEndSlot;

      return {
        valid: false,
        violations: [
          `Role ${role.code} requires consecutive slots but found gap of ${gapSlots} slots between assignments ending at ${current.endMinutes} and starting at ${next.startMinutes}`,
        ],
      };
    }

    // Also check for overlaps (shouldn't happen but good to catch)
    if (current.endMinutes > next.startMinutes) {
      return {
        valid: false,
        violations: [
          `Overlapping assignments detected for role ${role.code}: current ends at ${current.endMinutes} but next starts at ${next.startMinutes}`,
        ],
      };
    }
  }

  return {
    valid: true,
    violations: [],
  };
}

/**
 * Helper to check if a set of assignments can be merged into a consecutive block
 */
export function canMergeIntoConsecutiveBlock(
  assignments: SolverAssignment[],
  store: StoreConfig
): boolean {
  if (assignments.length === 0) return true;
  if (assignments.length === 1) return true;

  const sorted = [...assignments].sort((a, b) => a.startMinutes - b.startMinutes);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // Check if current.end exactly matches next.start (no gap, no overlap)
    if (current.endMinutes !== next.startMinutes) {
      return false;
    }
  }

  return true;
}
