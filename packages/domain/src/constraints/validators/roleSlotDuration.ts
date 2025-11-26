import type { ValidationResult, SolverAssignment, StoreConfig, RoleConfig } from '../types';
import { calculateSlotsForAssignment } from './slotAlignment';

/**
 * Validates that assignment duration respects role's min/max slot constraints
 * and block size requirements.
 * 
 * Rules:
 * - Assignment duration (in slots) must be >= role.minSlots
 * - Assignment duration (in slots) must be <= role.maxSlots
 * - Assignment duration (in slots) must be a multiple of role.blockSize
 * 
 * Example with baseSlotMinutes=30:
 * - Role: minSlots=2, maxSlots=10, blockSize=2
 * - Valid: 1 hour (2 slots), 2 hours (4 slots), 3 hours (6 slots)
 * - Invalid: 30 min (1 slot - too short), 1.5 hours (3 slots - not multiple of blockSize=2)
 * 
 * @param assignment - The assignment to validate
 * @param store - Store configuration with baseSlotMinutes
 * @param role - Role configuration with minSlots, maxSlots, and blockSize
 * @returns Validation result with any violations
 */
export function validateRoleSlotDuration(
  assignment: SolverAssignment,
  store: StoreConfig,
  role: RoleConfig
): ValidationResult {
  const violations: string[] = [];
  
  const slots = calculateSlotsForAssignment(assignment, store.baseSlotMinutes);
  const durationMinutes = assignment.endMinutes - assignment.startMinutes;
  const durationHours = durationMinutes / 60;

  // Check minimum duration
  if (slots < role.minSlots) {
    const minMinutes = role.minSlots * store.baseSlotMinutes;
    const minHours = minMinutes / 60;
    violations.push(
      `Assignment duration is ${durationHours} hr(s) (${slots} slots) but role '${role.code}' requires minimum ${minHours} hr(s) (${role.minSlots} slots)`
    );
  }

  // Check maximum duration
  if (slots > role.maxSlots) {
    const maxMinutes = role.maxSlots * store.baseSlotMinutes;
    const maxHours = maxMinutes / 60;
    violations.push(
      `Assignment duration is ${durationHours} hr(s) (${slots} slots) but role '${role.code}' allows maximum ${maxHours} hr(s) (${role.maxSlots} slots)`
    );
  }

  // Check block size (assignments must be multiples of blockSize)
  if (role.blockSize > 1 && slots % role.blockSize !== 0) {
    const blockMinutes = role.blockSize * store.baseSlotMinutes;
    const blockHours = blockMinutes / 60;
    violations.push(
      `Assignment duration is ${slots} slots but role '${role.code}' requires assignments in blocks of ${role.blockSize} slots (${blockHours} hr increments)`
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Helper: Check if duration is within role's slot bounds
 */
export function isWithinSlotBounds(
  assignment: SolverAssignment,
  store: StoreConfig,
  role: RoleConfig
): boolean {
  const slots = calculateSlotsForAssignment(assignment, store.baseSlotMinutes);
  return slots >= role.minSlots && slots <= role.maxSlots;
}

/**
 * Helper: Get allowed duration range for a role
 */
export function getAllowedDurationRange(
  store: StoreConfig,
  role: RoleConfig
): { minHours: number; maxHours: number; minSlots: number; maxSlots: number } {
  const minMinutes = role.minSlots * store.baseSlotMinutes;
  const maxMinutes = role.maxSlots * store.baseSlotMinutes;
  
  return {
    minHours: minMinutes / 60,
    maxHours: maxMinutes / 60,
    minSlots: role.minSlots,
    maxSlots: role.maxSlots,
  };
}
