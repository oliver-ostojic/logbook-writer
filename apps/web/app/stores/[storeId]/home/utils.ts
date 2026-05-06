// Parse date string (YYYY-MM-DD) as local date without timezone conversion
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Format date as "05 Jan, 2025"
export function formatLogbookDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
}

// Format date as "12/16/25"
export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

// Capitalize first letter and lowercase rest
export function capitalizeStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

// Format relative time from ISO date string
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Get display text for activity log action strings
export function getActivityDisplayType(action: string): string {
  switch (action) {
    case 'shifts_add': return 'added shifts for';
    case 'shifts_edit': return 'edited shifts for';
    case 'shifts_save': return 'saved shifts for';
    case 'constraints_save': return 'updated constraints for';
    case 'solver_run': return 'ran solver for';
    case 'logbook_generate': return 'generated logbook for';
    case 'logbook_regenerate': return 'regenerated logbook for';
    case 'logbook_publish': return 'published logbook for';
    case 'logbook_publish_with_edits': return 'published logbook for';
    case 'assignment_edit': return 'edited assignments for';
    case 'comment': return 'commented';
    case 'crew_create': return 'created crew member';
    case 'crew_update': return 'updated crew member';
    case 'crew_delete': return 'deleted crew member';
    case 'login': return 'logged in';
    case 'logout': return 'logged out';
    default: return action.replace(/_/g, ' ');
  }
}

// Format activity log date as "Monday, Jan 20, 2026"
export function formatActivityDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDayYear = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dayName}, ${monthDayYear}`;
}

// Group an array of rules into a Map keyed by rule type
export function groupRulesByType(rules: any[], isStoreRules: boolean = false): Map<string, any[]> {
  const grouped = new Map<string, any[]>();
  for (const rule of rules) {
    const ruleType = isStoreRules ? rule.RoleRule?.type : rule.type;
    if (!ruleType) continue;
    const existing = grouped.get(ruleType) || [];
    grouped.set(ruleType, [...existing, rule]);
  }
  return grouped;
}
