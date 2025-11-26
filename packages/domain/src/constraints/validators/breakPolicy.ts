import type { ValidationResult } from '../types';

/**
 * Store break policy configuration
 */
export interface BreakPolicyConfig {
  reqShiftLengthForBreak: number; // Min shift length (minutes) requiring a break
  breakWindowStart: number;       // Min offset from shift start for break (minutes)
  breakWindowEnd: number;         // Max offset from shift start for break (minutes)
}

/**
 * A shift with potential break assignments
 */
export interface ShiftWithBreak {
  crewId: string;
  startMinutes: number;
  endMinutes: number;
  hasBreak: boolean;          // Whether break is assigned
  breakStartMinutes?: number; // If hasBreak, when break starts
  breakEndMinutes?: number;   // If hasBreak, when break ends
}

/**
 * Validates that shifts follow store break policy.
 * 
 * Rules:
 * 1. If shift length >= reqShiftLengthForBreak, MUST have a break
 * 2. Break must start within [breakWindowStart, breakWindowEnd] offset from shift start
 * 3. Shifts shorter than reqShiftLengthForBreak should NOT have breaks
 * 
 * Example (default policy):
 * - reqShiftLengthForBreak = 360 (6 hours)
 * - breakWindowStart = 180 (3 hours)
 * - breakWindowEnd = 270 (4.5 hours)
 * 
 * Valid:
 * - 8am-2pm (6hr shift) with break at 11am (3hrs after start) ✓
 * - 8am-2pm (6hr shift) with break at 12pm (4hrs after start) ✓
 * - 8am-1pm (5hr shift) with no break ✓
 * 
 * Invalid:
 * - 8am-2pm (6hr shift) with no break ✗ (requires break)
 * - 8am-2pm (6hr shift) with break at 9am (1hr after start) ✗ (too early)
 * - 8am-2pm (6hr shift) with break at 1pm (5hrs after start) ✗ (too late)
 * - 8am-1pm (5hr shift) with break ✗ (too short for break)
 * 
 * @param shifts - List of shifts to validate
 * @param policy - Store break policy configuration
 * @returns Validation result with violations
 */
export function validateBreakPolicy(
  shifts: ShiftWithBreak[],
  policy: BreakPolicyConfig
): ValidationResult {
  const violations: string[] = [];

  for (const shift of shifts) {
    const shiftLength = shift.endMinutes - shift.startMinutes;
    const requiresBreak = shiftLength >= policy.reqShiftLengthForBreak;

    if (requiresBreak && !shift.hasBreak) {
      // Long shift missing required break
      violations.push(
        `Crew '${shift.crewId}' shift ${formatMinutes(shift.startMinutes)}-${formatMinutes(shift.endMinutes)} ` +
        `(${shiftLength}min) requires break but has none (reqShiftLength: ${policy.reqShiftLengthForBreak}min)`
      );
    } else if (!requiresBreak && shift.hasBreak) {
      // Short shift has unnecessary break
      violations.push(
        `Crew '${shift.crewId}' shift ${formatMinutes(shift.startMinutes)}-${formatMinutes(shift.endMinutes)} ` +
        `(${shiftLength}min) has break but is too short (reqShiftLength: ${policy.reqShiftLengthForBreak}min)`
      );
    } else if (requiresBreak && shift.hasBreak) {
      // Validate break timing
      const breakOffset = shift.breakStartMinutes! - shift.startMinutes;
      
      if (breakOffset < policy.breakWindowStart) {
        violations.push(
          `Crew '${shift.crewId}' break at ${formatMinutes(shift.breakStartMinutes!)} is too early ` +
          `(${breakOffset}min from shift start, min: ${policy.breakWindowStart}min)`
        );
      } else if (breakOffset > policy.breakWindowEnd) {
        violations.push(
          `Crew '${shift.crewId}' break at ${formatMinutes(shift.breakStartMinutes!)} is too late ` +
          `(${breakOffset}min from shift start, max: ${policy.breakWindowEnd}min)`
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Check if a single shift requires a break
 */
export function shiftRequiresBreak(
  shiftLengthMinutes: number,
  policy: BreakPolicyConfig
): boolean {
  return shiftLengthMinutes >= policy.reqShiftLengthForBreak;
}

/**
 * Get the valid break window for a shift
 */
export function getBreakWindow(
  shiftStartMinutes: number,
  policy: BreakPolicyConfig
): { earliestBreak: number; latestBreak: number } {
  return {
    earliestBreak: shiftStartMinutes + policy.breakWindowStart,
    latestBreak: shiftStartMinutes + policy.breakWindowEnd,
  };
}

/**
 * Check if a break time is valid for a shift
 */
export function isBreakTimeValid(
  shiftStartMinutes: number,
  breakStartMinutes: number,
  policy: BreakPolicyConfig
): boolean {
  const breakOffset = breakStartMinutes - shiftStartMinutes;
  return breakOffset >= policy.breakWindowStart && breakOffset <= policy.breakWindowEnd;
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
