/**
 * Pre-solve feasibility analyzer.
 * 
 * Validates solver input before running the solver to catch common issues.
 * Uses the NEW schema (crewQuotas, coverageWindows, taskLength, roleFamilies).
 * 
 * Categories of checks:
 * 1. CREW ROLES - Do crew have roles they can perform?
 * 2. CREW QUOTAS - Can crew satisfy their quota + family constraints?
 * 3. COVERAGE WINDOWS - Are there enough eligible crew during each window?
 * 5. ROLE FAMILIES - Can family min requirements be satisfied?
 * 8. SHIFT CAPACITY - Can crew's shifts be filled with eligible roles?
 */

import type {
  SolverInputV2,
  RoleDescriptor,
  CrewDescriptor,
  RoleFamilyDescriptor,
  CrewQuotaDescriptor,
} from '../solver2/types';

export interface FeasibilityViolation {
  severity: 'error' | 'warning';
  category: FeasibilityCategory;
  message: string;
  details?: Record<string, unknown>;
}

export type FeasibilityCategory =
  | 'daily-requirement'
  | 'hourly-requirement'
  | 'window-requirement'
  | 'role-min-max'
  | 'crew-availability'
  | 'shift-length'
  | 'role-qualification'
  | 'conflicting-constraints'
  | 'insufficient-constraints'
  | 'unknown';

export interface FeasibilityAnalysisResult {
  feasible: boolean;
  violations: FeasibilityViolation[];
  summary: string[];
}

interface FeasibilityContext {
  input: SolverInputV2;
  roleById: Map<number, RoleDescriptor>;
  familyById: Map<number, RoleFamilyDescriptor>;
  crewById: Map<string, CrewDescriptor>;
  // Crew available at each hour (hour -> crewIds)
  crewByHour: Map<number, Set<string>>;
  // Crew qualified for each role (roleId -> crewIds)
  crewByRole: Map<number, Set<string>>;
  // Crew qualified for role AND available at hour (roleId -> hour -> crewIds)
  eligibleCrewByRoleAndHour: Map<number, Map<number, Set<string>>>;
  // Family IDs that each crew is qualified for (crewId -> familyIds)
  crewFamilyIds: Map<string, Set<number>>;
}

/**
 * Main entry point: analyze solver input for feasibility issues
 * 
 * Checks:
 * 1. checkCrewHaveRoles - Do all crew have at least one role?
 * 2. checkCrewQuotasFeasible - Can crew satisfy their quota + family constraints?
 * 3. checkCoverageWindowsFeasible - Are there enough eligible crew during coverage windows?
 * 5. checkRoleFamilyMinMaxFeasible - Can crew satisfy family min requirements?
 * 8. checkCrewShiftCanBeFilled - Can crew's shift be filled with their eligible roles?
 */
export function analyzeFeasibility(input: SolverInputV2): FeasibilityAnalysisResult {
  const ctx = buildContext(input);
  
  const violations: FeasibilityViolation[] = [
    ...checkCrewHaveRoles(ctx),
    ...checkCrewQuotasFeasible(ctx),
    ...checkCoverageWindowsFeasible(ctx),
    ...checkRoleFamilyMinMaxFeasible(ctx),
    ...checkCrewShiftCanBeFilled(ctx),
  ];
  
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  
  const summary: string[] = [];
  if (errors.length > 0) {
    summary.push(`${errors.length} error(s) found - schedule may be infeasible`);
  }
  if (warnings.length > 0) {
    summary.push(`${warnings.length} warning(s) found - schedule may have issues`);
  }
  if (violations.length === 0) {
    summary.push('No feasibility issues detected');
  }
  
  return {
    feasible: errors.length === 0,
    violations,
    summary,
  };
}

function buildContext(input: SolverInputV2): FeasibilityContext {
  const roleById = new Map<number, RoleDescriptor>();
  for (const role of input.roles) {
    roleById.set(role.id, role);
  }

  const familyById = new Map<number, RoleFamilyDescriptor>();
  for (const family of input.roleFamilies) {
    familyById.set(family.id, family);
  }

  const crewById = new Map<string, CrewDescriptor>();
  for (const crew of input.crew) {
    crewById.set(crew.id, crew);
  }

  // Build crew availability by hour
  const crewByHour = new Map<number, Set<string>>();
  const storeOpenHour = Math.floor(input.store.openMinutesFromMidnight / 60);
  const storeCloseHour = Math.ceil(input.store.closeMinutesFromMidnight / 60);
  
  for (let hour = storeOpenHour; hour < storeCloseHour; hour++) {
    crewByHour.set(hour, new Set());
  }

  for (const crew of input.crew) {
    const crewStartHour = Math.floor(crew.shiftStartMin / 60);
    const crewEndHour = Math.ceil(crew.shiftEndMin / 60);
    
    for (let hour = crewStartHour; hour < crewEndHour; hour++) {
      if (!crewByHour.has(hour)) {
        crewByHour.set(hour, new Set());
      }
      crewByHour.get(hour)!.add(crew.id);
    }
  }

  // Build crew qualified for each role
  const crewByRole = new Map<number, Set<string>>();
  for (const role of input.roles) {
    crewByRole.set(role.id, new Set());
  }
  
  for (const crew of input.crew) {
    for (const roleId of crew.roleIds) {
      if (!crewByRole.has(roleId)) {
        crewByRole.set(roleId, new Set());
      }
      crewByRole.get(roleId)!.add(crew.id);
    }
  }

  // Build eligible crew by role AND hour
  const eligibleCrewByRoleAndHour = new Map<number, Map<number, Set<string>>>();
  
  for (const role of input.roles) {
    const hourMap = new Map<number, Set<string>>();
    const qualifiedCrew = crewByRole.get(role.id) ?? new Set();
    
    for (const [hour, availableCrew] of crewByHour.entries()) {
      const eligible = new Set<string>();
      for (const crewId of availableCrew) {
        if (qualifiedCrew.has(crewId)) {
          eligible.add(crewId);
        }
      }
      hourMap.set(hour, eligible);
    }
    
    eligibleCrewByRoleAndHour.set(role.id, hourMap);
  }

  // Build family IDs that each crew is qualified for
  const crewFamilyIds = new Map<string, Set<number>>();
  for (const crew of input.crew) {
    const familyIds = new Set<number>();
    for (const roleId of crew.roleIds) {
      const role = roleById.get(roleId);
      if (role) {
        familyIds.add(role.familyId);
      }
    }
    crewFamilyIds.set(crew.id, familyIds);
  }

  return {
    input,
    roleById,
    familyById,
    crewById,
    crewByHour,
    crewByRole,
    eligibleCrewByRoleAndHour,
    crewFamilyIds,
  };
}

// =============================================================================
// CHECK 1: Do all crew have at least one role they can perform?
// =============================================================================
function checkCrewHaveRoles(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const crew of ctx.input.crew) {
    if (crew.roleIds.length === 0) {
      violations.push({
        severity: 'error',
        category: 'role-qualification',
        message: `${crew.name} has a shift but no role qualifications. They cannot be assigned any work.`,
        details: { crewId: crew.id, crewName: crew.name },
      });
    }
  }

  return violations;
}

// =============================================================================
// CHECK 2: Can crew quotas be satisfied given shift length and family constraints?
// - Verify quota requiredMin doesn't exceed its role family's maxMinutes
// - Verify quota + other family minimums fit within crew's shift
// =============================================================================
function checkCrewQuotasFeasible(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const quota of ctx.input.crewQuotas) {
    const crew = ctx.crewById.get(quota.crewId);
    const role = ctx.roleById.get(quota.roleId);
    
    // Check if role exists
    if (!role) {
      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `Crew quota references unknown role ID ${quota.roleId}.`,
        details: { crewId: quota.crewId, roleId: quota.roleId, requiredMin: quota.requiredMin },
      });
      continue;
    }

    const family = ctx.familyById.get(role.familyId);
    if (!family) {
      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `Role ${role.displayName} references unknown family ID ${role.familyId}.`,
        details: { roleId: quota.roleId, familyId: role.familyId },
      });
      continue;
    }

    // Check if crew exists (has a shift today)
    if (!crew) {
      const requiredHours = quota.requiredMin / 60;
      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `Crew quota requires ${requiredHours.toFixed(1)}h of ${role.displayName}, but the crew member (ID: ${quota.crewId}) doesn't have a shift today.`,
        details: { crewId: quota.crewId, roleId: quota.roleId, requiredMin: quota.requiredMin },
      });
      continue;
    }

    // Check if crew is qualified for this role
    if (!crew.roleIds.includes(quota.roleId)) {
      const requiredHours = quota.requiredMin / 60;
      violations.push({
        severity: 'error',
        category: 'role-qualification',
        message: `${crew.name} is required to work ${requiredHours.toFixed(1)}h on ${role.displayName}, but they don't have that role qualification.`,
        details: { crewId: crew.id, roleId: role.id, requiredMin: quota.requiredMin },
      });
      continue;
    }

    // CHECK 2a: Quota requiredMin must not exceed its role family's maxMinutes
    if (quota.requiredMin > family.maxMinutes) {
      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `${crew.name}'s ${role.displayName} quota of ${(quota.requiredMin / 60).toFixed(1)}h exceeds the ${family.name} family maximum of ${(family.maxMinutes / 60).toFixed(1)}h.`,
        details: {
          crewId: crew.id,
          roleId: role.id,
          requiredMin: quota.requiredMin,
          familyId: family.id,
          familyName: family.name,
          familyMaxMinutes: family.maxMinutes,
        },
      });
    }

    // CHECK 2b: Quota + other family minimums must fit within crew's shift
    const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
    const quotaFamilyId = role.familyId;

    // For the quota's own family: use max(requiredMin, family.minMinutes)
    // If requiredMin < family.min, crew still needs to work family.min total
    // If requiredMin >= family.min, the quota itself is what they need
    const quotaFamilyContribution = Math.max(quota.requiredMin, family.minMinutes);

    // Sum up minimums from OTHER families the crew is qualified for
    let otherFamilyMinsTotal = 0;
    const otherFamilyBreakdown: { family: RoleFamilyDescriptor; minMinutes: number }[] = [];
    
    const crewFamilyIds = ctx.crewFamilyIds.get(crew.id) ?? new Set();
    for (const familyId of crewFamilyIds) {
      if (familyId === quotaFamilyId) continue; // Skip the quota's own family
      
      const otherFamily = ctx.familyById.get(familyId);
      if (otherFamily && otherFamily.minMinutes > 0) {
        otherFamilyMinsTotal += otherFamily.minMinutes;
        otherFamilyBreakdown.push({ family: otherFamily, minMinutes: otherFamily.minMinutes });
      }
    }

    const totalRequiredMinutes = quotaFamilyContribution + otherFamilyMinsTotal;

    if (totalRequiredMinutes > shiftMinutes) {
      // Build breakdown string
      const parts: string[] = [];
      
      // Add the quota's family contribution
      if (quota.requiredMin >= family.minMinutes) {
        parts.push(`${(quota.requiredMin / 60).toFixed(1)}h ${role.displayName} (quota)`);
      } else {
        parts.push(`${(family.minMinutes / 60).toFixed(1)}h ${family.name} (family min, quota only ${(quota.requiredMin / 60).toFixed(1)}h)`);
      }
      
      // Add other family minimums
      for (const { family: f, minMinutes } of otherFamilyBreakdown) {
        parts.push(`${(minMinutes / 60).toFixed(1)}h ${f.name} (min)`);
      }
      
      const breakdown = parts.join(' + ');

      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `${crew.name}'s required time (${breakdown} = ${(totalRequiredMinutes / 60).toFixed(1)}h) exceeds their ${(shiftMinutes / 60).toFixed(1)}h shift.`,
        details: {
          crewId: crew.id,
          crewName: crew.name,
          shiftMinutes,
          quotaRequiredMin: quota.requiredMin,
          quotaFamilyMinMinutes: family.minMinutes,
          quotaFamilyContribution,
          otherFamilyMinsTotal,
          totalRequiredMinutes,
          otherFamilies: otherFamilyBreakdown.map(f => ({
            familyId: f.family.id,
            familyName: f.family.name,
            minMinutes: f.minMinutes,
          })),
        },
      });
    }
  }

  return violations;
}

// =============================================================================
// CHECK 3: Are there enough qualified crew for each coverage window?
// For each RoleCoverageWindow, check if we have enough eligible crew
// covering the window [startMin, endMin) to satisfy crewPerTaskLength.
// =============================================================================
function checkCoverageWindowsFeasible(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const window of ctx.input.coverageWindows) {
    const role = ctx.roleById.get(window.roleId);
    if (!role) {
      violations.push({
        severity: 'error',
        category: 'window-requirement',
        message: `Coverage window references unknown role ID ${window.roleId}.`,
        details: { roleId: window.roleId, startMin: window.startMin, endMin: window.endMin },
      });
      continue;
    }

    const requiredCrew = window.crewPerTaskLength;
    if (requiredCrew <= 0) continue;

    const taskLength = role.taskLength;
    
    // Check each taskLength-sized position within the window
    for (let positionStart = window.startMin; positionStart + taskLength <= window.endMin; positionStart += taskLength) {
      const positionEnd = positionStart + taskLength;
      
      // Count how many qualified crew have shifts that fully cover this position
      let availableCount = 0;
      const availableCrewIds: string[] = [];
      
      for (const crew of ctx.input.crew) {
        // Crew must be qualified for this role
        if (!crew.roleIds.includes(window.roleId)) continue;
        
        // Crew's shift must fully cover this position
        if (crew.shiftStartMin <= positionStart && crew.shiftEndMin >= positionEnd) {
          availableCount++;
          availableCrewIds.push(crew.id);
        }
      }

      if (availableCount < requiredCrew) {
        const startTime = formatMinutes(positionStart);
        const endTime = formatMinutes(positionEnd);
        const windowStartTime = formatMinutes(window.startMin);
        const windowEndTime = formatMinutes(window.endMin);
        
        violations.push({
          severity: 'error',
          category: 'window-requirement',
          message: `${role.displayName} requires ${requiredCrew} crew at ${startTime}–${endTime} (within ${windowStartTime}–${windowEndTime} window), but only ${availableCount} qualified crew ${availableCount === 1 ? 'is' : 'are'} available.`,
          details: { 
            roleId: role.id, 
            windowStartMin: window.startMin,
            windowEndMin: window.endMin,
            positionStartMin: positionStart,
            positionEndMin: positionEnd,
            required: requiredCrew, 
            available: availableCount,
            availableCrewIds,
          },
        });
        // Report first problematic position only
        break;
      }
    }
  }

  return violations;
}

// Helper to format minutes as HH:MM
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}

// =============================================================================
// CHECK 4: (MERGED INTO CHECK 3)
// The old windowRequirements and hourlyRequirements are now unified as
// coverageWindows. This check is kept as a placeholder for backwards compat.
// =============================================================================
function checkWindowRequirementsFeasible(_ctx: FeasibilityContext): FeasibilityViolation[] {
  // Merged into checkCoverageWindowsFeasible (Check 3)
  return [];
}

// =============================================================================
// CHECK 5: Can crew satisfy role family min/max constraints?
// For each crew, check if they're qualified for a family with minMinutes > 0
// and whether their shift is long enough to potentially satisfy it.
// =============================================================================
function checkRoleFamilyMinMaxFeasible(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const crew of ctx.input.crew) {
    const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
    const crewFamilyIds = ctx.crewFamilyIds.get(crew.id) ?? new Set();

    for (const familyId of crewFamilyIds) {
      const family = ctx.familyById.get(familyId);
      if (!family) continue;

      // Check if shift is long enough to satisfy family minimum
      if (family.minMinutes > 0 && family.minMinutes > shiftMinutes) {
        violations.push({
          severity: 'warning',
          category: 'role-min-max',
          message: `${crew.name}'s ${(shiftMinutes / 60).toFixed(1)}h shift is shorter than the ${family.name} family minimum of ${(family.minMinutes / 60).toFixed(1)}h. They may not be able to satisfy family requirements.`,
          details: { 
            crewId: crew.id, 
            crewName: crew.name,
            familyId: family.id,
            familyName: family.name,
            familyMinMinutes: family.minMinutes,
            shiftMinutes,
          },
        });
      }
    }
  }

  return violations;
}

// =============================================================================
// CHECK 6: (MERGED INTO CHECK 2)
// The old dailyRequirements shift length check is now handled by
// checkCrewQuotasFeasible which validates crewQuotas + family constraints.
// =============================================================================
function checkShiftLengthAccommodatesRequirements(_ctx: FeasibilityContext): FeasibilityViolation[] {
  // Merged into checkCrewQuotasFeasible (Check 2)
  return [];
}

// =============================================================================
// CHECK 7: (MERGED INTO CHECK 2)
// The old conflicting requirements check (dailyRequirements + role minimums)
// is now handled by checkCrewQuotasFeasible which validates quota + all
// family minimums fit within the shift.
// =============================================================================
function checkConflictingDailyRequirements(_ctx: FeasibilityContext): FeasibilityViolation[] {
  // Merged into checkCrewQuotasFeasible (Check 2)
  return [];
}

// =============================================================================
// CHECK 8: Can crew's shift be fully filled with their eligible roles?
// For each crew, verify they have at least one eligible role that can cover
// every slot of their shift (considering coverage windows and role availability).
// =============================================================================
function checkCrewShiftCanBeFilled(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  // Build a map of role -> coverage windows (to know when roles are "active")
  const roleWindowsByRole = new Map<number, { startMin: number; endMin: number }[]>();
  for (const window of ctx.input.coverageWindows) {
    if (!roleWindowsByRole.has(window.roleId)) {
      roleWindowsByRole.set(window.roleId, []);
    }
    roleWindowsByRole.get(window.roleId)!.push({
      startMin: window.startMin,
      endMin: window.endMin,
    });
  }

  for (const crew of ctx.input.crew) {
    const shiftStart = crew.shiftStartMin;
    const shiftEnd = crew.shiftEndMin;

    // For each minute of their shift, check if ANY eligible role can cover it
    // We'll check in 30-minute increments for efficiency
    const uncoverableSlots: number[] = [];
    
    for (let minute = shiftStart; minute < shiftEnd; minute += 30) {
      let canBeCovered = false;
      
      for (const roleId of crew.roleIds) {
        const role = ctx.roleById.get(roleId);
        if (!role) continue;

        const windows = roleWindowsByRole.get(roleId);
        
        // If role has no coverage windows, it can be assigned anytime (e.g., BRK)
        if (!windows || windows.length === 0) {
          canBeCovered = true;
          break;
        }
        
        // Check if this minute falls within any of the role's coverage windows
        for (const window of windows) {
          if (minute >= window.startMin && minute < window.endMin) {
            canBeCovered = true;
            break;
          }
        }
        
        if (canBeCovered) break;
      }
      
      if (!canBeCovered) {
        uncoverableSlots.push(minute);
      }
    }

    if (uncoverableSlots.length > 0) {
      // Group consecutive slots for cleaner reporting
      const firstUncoverable = uncoverableSlots[0];
      const lastUncoverable = uncoverableSlots[uncoverableSlots.length - 1];
      
      const firstTime = formatMinutes(firstUncoverable);
      const lastTime = formatMinutes(lastUncoverable + 30);
      
      violations.push({
        severity: 'error',
        category: 'insufficient-constraints',
        message: `${crew.name}'s shift has ${uncoverableSlots.length * 30} minutes (${firstTime}–${lastTime}) that cannot be filled. None of their qualified roles have coverage windows during this time.`,
        details: {
          crewId: crew.id,
          crewName: crew.name,
          shiftStartMin: shiftStart,
          shiftEndMin: shiftEnd,
          uncoverableSlots,
          crewRoleIds: crew.roleIds,
        },
      });
    }
  }

  return violations;
}

// =============================================================================
// HELPERS
// =============================================================================

function buildSummary(violations: FeasibilityViolation[], feasible: boolean): string[] {
  const lines: string[] = [];
  
  if (feasible) {
    lines.push('✓ Pre-solve feasibility check passed');
    const warnings = violations.filter(v => v.severity === 'warning');
    if (warnings.length > 0) {
      lines.push(`• ${warnings.length} warning${warnings.length === 1 ? '' : 's'} detected (schedule may still be suboptimal)`);
    }
  } else {
    const errors = violations.filter(v => v.severity === 'error');
    lines.push(`✗ Pre-solve feasibility check failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}`);
    
    // Group by category for summary
    const byCategory = new Map<FeasibilityCategory, number>();
    for (const v of errors) {
      byCategory.set(v.category, (byCategory.get(v.category) ?? 0) + 1);
    }
    
    for (const [category, count] of byCategory.entries()) {
      lines.push(`  - ${formatCategory(category)}: ${count}`);
    }
  }

  return lines;
}

function formatCategory(category: FeasibilityCategory): string {
  switch (category) {
    case 'daily-requirement': return 'Daily requirement issues';
    case 'hourly-requirement': return 'Hourly coverage issues';
    case 'window-requirement': return 'Window coverage issues';
    case 'role-min-max': return 'Role min/max issues';
    case 'crew-availability': return 'Crew availability issues';
    case 'shift-length': return 'Shift length issues';
    case 'role-qualification': return 'Role qualification issues';
    case 'conflicting-constraints': return 'Conflicting constraint issues';
    case 'insufficient-constraints': return 'Insufficient role constraint issues';
    case 'unknown': return 'Unknown issues';
    default: return category;
  }
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:00 ${suffix}`;
}

/**
 * Generate a catch-all message when solver is infeasible but no specific violation was detected
 * TODO: Refactor to use new schema (RoleCoverageWindow, CrewRoleQuota)
 */
export function generateUnknownInfeasibilityMessage(input: SolverInputV2): string {
  const crewCount = input.crew.length;
  const roleCount = input.roles.length;
  // Cast to any since new schema uses coverageWindows and crewQuotas instead of old fields
  const inp = input as any;
  const coverageWindowCount = inp.coverageWindows?.length ?? 0;
  const crewQuotaCount = inp.crewQuotas?.length ?? 0;

  return `The schedule could not be generated. The combination of constraints (${coverageWindowCount} coverage windows, ${crewQuotaCount} crew quotas) cannot be satisfied with the available ${crewCount} crew members and ${roleCount} roles. Try reducing coverage requirements or adding more crew shifts.`;
}
