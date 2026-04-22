/**
 * Shared constants for role rule types
 * This is the single source of truth for role rule type display names in the frontend
 */

export const ROLE_RULE_TYPE_LABELS: Record<string, string> = {
  'CANNOT_BE_ASSIGNED_BEFORE': 'Specify role ordering',
  'CANNOT_BE_ASSIGNED_AFTER': 'Role y must come before role X',
  'MIN_CONSECUTIVE_MINUTES': 'Minimum time on role consecutively',
  'MAX_CONSECUTIVE_MINUTES': 'Maximum time on role consecutively',
  'MAX_TOTAL_MINUTES': 'Maximum total time on role per day',
  'FORBID_ROLE': 'Block crew from role',
  'TIMING': 'Role only during time window',
  'LIKE_ROLE_FOR_HOUR_X': 'Crew prefers role at a certain hour',
  'DISLIKE_ROLE_FOR_HOUR_X': 'Crew avoids role at a certain hour',
  'MIN_SHIFT_LENGTH_FOR_ACCESS': 'Requires minimum shift length',
  'ASSIGN_BEFORE_SHIFT_MIN_X': 'Role in first X minutes',
  'ASSIGN_AFTER_SHIFT_MIN_X': 'Role after X minutes in',
  'MAX_CREW_ON_AT_A_TIME': 'Max crew on role at once',
  'ALLOW_HALF_BLOCKSIZE': 'Allow half block size',
  'DISTRIBUTION_BETWEEN_ROLE_X': 'Choose balance between roles',
  'CANNOT_ASSIGN_DURING_STORE_HOUR_X': 'No role during hour X',
};

/**
 * Get the display name for a role rule type
 */
export function getRoleRuleTypeDisplayName(ruleType: string): string {
  return ROLE_RULE_TYPE_LABELS[ruleType] || ruleType;
}
