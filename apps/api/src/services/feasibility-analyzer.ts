/**
 * Pre-solve feasibility analyzer.
 * 
 * This analyzer checks if the solver input constraints are satisfiable BEFORE
 * running the solver. If we can detect infeasibility upfront, we can provide
 * specific, actionable error messages instead of a generic "INFEASIBLE" result.
 * 
 * Categories of checks:
 * 1. DAILY REQUIREMENTS - Can crew members fulfill their daily role requirements?
 * 2. HOURLY REQUIREMENTS - Are there enough eligible crew per hour?
 * 3. WINDOW REQUIREMENTS - Are there enough eligible crew during each window?
 * 4. ROLE MIN/MAX - Can role min/max constraints be satisfied given shift lengths?
 * 5. CREW AVAILABILITY - Do crew have roles they can perform?
 * 6. SHIFT LENGTH CONSTRAINTS - Is the shift long enough for all required roles?
 */

import type {
  SolverInputV2,
  RoleDescriptor,
  CrewDescriptor,
  DailyRequirementDescriptor,
  HourlyRequirementDescriptor,
  WindowRequirementDescriptor,
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
  crewById: Map<string, CrewDescriptor>;
  // Crew available at each hour (hour -> crewIds)
  crewByHour: Map<number, Set<string>>;
  // Crew qualified for each role (roleId -> crewIds)
  crewByRole: Map<number, Set<string>>;
  // Crew qualified for role AND available at hour (roleId -> hour -> crewIds)
  eligibleCrewByRoleAndHour: Map<number, Map<number, Set<string>>>;
}

/**
 * Main entry point: analyze solver input for feasibility issues
 */
export function analyzeFeasibility(input: SolverInputV2): FeasibilityAnalysisResult {
  const context = buildContext(input);
  const violations: FeasibilityViolation[] = [];

  // Run all checks
  violations.push(
    ...checkCrewHaveRoles(context),
    ...checkDailyRequirementsFeasible(context),
    ...checkHourlyRequirementsFeasible(context),
    ...checkWindowRequirementsFeasible(context),
    ...checkRoleMinMaxFeasible(context),
    ...checkShiftLengthAccommodatesRequirements(context),
    ...checkConflictingDailyRequirements(context),
    ...checkCrewShiftCanBeFilled(context),
  );

  const feasible = violations.filter(v => v.severity === 'error').length === 0;
  const summary = buildSummary(violations, feasible);

  return { feasible, violations, summary };
}

function buildContext(input: SolverInputV2): FeasibilityContext {
  const roleById = new Map<number, RoleDescriptor>();
  for (const role of input.roles) {
    roleById.set(role.id, role);
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

  return {
    input,
    roleById,
    crewById,
    crewByHour,
    crewByRole,
    eligibleCrewByRoleAndHour,
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
// CHECK 2: Can daily requirements be satisfied given shift length?
// =============================================================================
function checkDailyRequirementsFeasible(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const req of ctx.input.dailyRequirements) {
    const crew = ctx.crewById.get(req.crewId);
    const role = ctx.roleById.get(req.roleId);
    
    // Check if role exists
    if (!role) {
      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `Daily requirement references unknown role ID ${req.roleId}.`,
        details: { crewId: req.crewId, roleId: req.roleId, requiredMinutes: req.requiredMinutes },
      });
      continue;
    }

    // Check if crew exists (has a shift today)
    if (!crew) {
      const requiredHours = req.requiredMinutes / 60;
      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `Daily constraint requires ${requiredHours}h of ${role.displayName}, but the crew member (ID: ${req.crewId}) doesn't have a shift today.`,
        details: { crewId: req.crewId, roleId: req.roleId, requiredMinutes: req.requiredMinutes },
      });
      continue;
    }

    const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
    const requiredHours = req.requiredMinutes / 60;
    const blockMinutes = role.blockSize * ctx.input.store.baseSlotMinutes;

    // Check if crew is qualified for this role
    if (!crew.roleIds.includes(req.roleId)) {
      violations.push({
        severity: 'error',
        category: 'role-qualification',
        message: `${crew.name} is required to work ${requiredHours}h on ${role.displayName}, but they don't have that role qualification.`,
        details: { crewId: crew.id, roleId: role.id, requiredMinutes: req.requiredMinutes },
      });
      continue;
    }

    // Check if daily requirement exceeds role's max slots
    if (role.maxSlots) {
      const roleMaxMinutes = role.maxSlots * blockMinutes;
      if (req.requiredMinutes > roleMaxMinutes) {
        violations.push({
          severity: 'error',
          category: 'daily-requirement',
          message: `${crew.name}'s daily ${role.displayName} constraint of ${requiredHours}h exceeds the role's maximum of ${(roleMaxMinutes / 60).toFixed(1)}h. Try lowering the required hours to ${(roleMaxMinutes / 60).toFixed(1)}h or less.`,
          details: { 
            crewId: crew.id, 
            roleId: role.id, 
            requiredMinutes: req.requiredMinutes,
            roleMaxMinutes,
            roleMaxSlots: role.maxSlots,
          },
        });
      }
    }

    // Check if shift is long enough for the daily requirement alone
    if (req.requiredMinutes > shiftMinutes) {
      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `${crew.name}'s daily ${role.displayName} constraint of ${requiredHours}h exceeds their ${(shiftMinutes / 60).toFixed(1)}h shift. Try lowering the required hours.`,
        details: { 
          crewId: crew.id, 
          roleId: role.id, 
          requiredMinutes: req.requiredMinutes,
          shiftMinutes,
        },
      });
    }
  }

  // Check COMBINED daily requirements + mandatory role minimums per crew member
  // Group daily requirements by crew
  const dailyReqsByCrewId = new Map<string, typeof ctx.input.dailyRequirements>();
  for (const req of ctx.input.dailyRequirements) {
    if (!dailyReqsByCrewId.has(req.crewId)) {
      dailyReqsByCrewId.set(req.crewId, []);
    }
    dailyReqsByCrewId.get(req.crewId)!.push(req);
  }

  // Check each crew member
  for (const crew of ctx.input.crew) {
    const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
    const dailyReqs = dailyReqsByCrewId.get(crew.id) ?? [];
    const dailyRoleIds = new Set(dailyReqs.map(r => r.roleId));
    
    // Sum up daily constraint requirements
    const dailyReqMinutes = dailyReqs.reduce((sum, r) => sum + r.requiredMinutes, 0);
    
    // Sum up mandatory minimums from roles with minSlots > 0 that DON'T have daily constraints
    // (roles with daily constraints are already accounted for)
    let mandatoryMinMinutes = 0;
    const mandatoryMins: { role: RoleDescriptor; minMinutes: number }[] = [];
    
    for (const roleId of crew.roleIds) {
      const role = ctx.roleById.get(roleId);
      if (!role) continue;
      
      // Skip if this role already has a daily constraint
      if (dailyRoleIds.has(roleId)) continue;
      
      // Only count roles with mandatory minimums (minSlots > 0)
      if (role.minSlots && role.minSlots > 0) {
        const blockMinutes = role.blockSize * ctx.input.store.baseSlotMinutes;
        const minMinutes = role.minSlots * blockMinutes;
        mandatoryMinMinutes += minMinutes;
        mandatoryMins.push({ role, minMinutes });
      }
    }
    
    const totalRequiredMinutes = dailyReqMinutes + mandatoryMinMinutes;

    if (totalRequiredMinutes > shiftMinutes) {
      // Build breakdown
      const parts: string[] = [];
      
      // Add daily constraints
      for (const req of dailyReqs) {
        const role = ctx.roleById.get(req.roleId);
        parts.push(`${(req.requiredMinutes / 60).toFixed(1)}h ${role?.displayName ?? 'Unknown'}`);
      }
      
      // Add mandatory minimums
      for (const { role, minMinutes } of mandatoryMins) {
        parts.push(`${(minMinutes / 60).toFixed(1)}h ${role.displayName} (min)`);
      }
      
      const breakdown = parts.join(' + ');

      violations.push({
        severity: 'error',
        category: 'daily-requirement',
        message: `${crew.name}'s required time (${breakdown} = ${(totalRequiredMinutes / 60).toFixed(1)}h) exceeds their ${(shiftMinutes / 60).toFixed(1)}h shift. Try lowering the daily constraint hours.`,
        details: {
          crewId: crew.id,
          crewName: crew.name,
          shiftMinutes,
          dailyReqMinutes,
          mandatoryMinMinutes,
          totalRequiredMinutes,
          dailyRequirements: dailyReqs.map(r => ({
            roleId: r.roleId,
            roleName: ctx.roleById.get(r.roleId)?.displayName,
            requiredMinutes: r.requiredMinutes,
          })),
          mandatoryMins: mandatoryMins.map(m => ({
            roleId: m.role.id,
            roleName: m.role.displayName,
            minMinutes: m.minMinutes,
          })),
        },
      });
    }
  }

  return violations;
}

// =============================================================================
// CHECK 3: Are there enough qualified crew at each hour for hourly requirements?
// =============================================================================
function checkHourlyRequirementsFeasible(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const req of ctx.input.hourlyRequirements) {
    const role = ctx.roleById.get(req.roleId);
    if (!role) continue;

    const eligibleAtHour = ctx.eligibleCrewByRoleAndHour.get(req.roleId)?.get(req.hour);
    const availableCount = eligibleAtHour?.size ?? 0;

    if (availableCount < req.required) {
      violations.push({
        severity: 'error',
        category: 'hourly-requirement',
        message: `${role.displayName} requires ${req.required} crew at ${formatHour(req.hour)}, but only ${availableCount} qualified crew ${availableCount === 1 ? 'is' : 'are'} available.`,
        details: { 
          roleId: role.id, 
          hour: req.hour, 
          required: req.required, 
          available: availableCount,
          eligibleCrewIds: eligibleAtHour ? Array.from(eligibleAtHour) : [],
        },
      });
    }
  }

  return violations;
}

// =============================================================================
// CHECK 4: Are there enough qualified crew during each window?
// =============================================================================
function checkWindowRequirementsFeasible(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const window of ctx.input.windowRequirements) {
    const role = ctx.roleById.get(window.roleId);
    if (!role) continue;

    // Check each hour in the window
    for (let hour = window.startHour; hour < window.endHour; hour++) {
      const eligibleAtHour = ctx.eligibleCrewByRoleAndHour.get(window.roleId)?.get(hour);
      const availableCount = eligibleAtHour?.size ?? 0;

      if (availableCount < window.requiredPerHour) {
        violations.push({
          severity: 'error',
          category: 'window-requirement',
          message: `${role.displayName} window (${formatHour(window.startHour)}–${formatHour(window.endHour)}) needs ${window.requiredPerHour} crew per hour, but only ${availableCount} qualified crew ${availableCount === 1 ? 'is' : 'are'} available at ${formatHour(hour)}.`,
          details: { 
            roleId: role.id, 
            windowStart: window.startHour,
            windowEnd: window.endHour,
            problemHour: hour,
            required: window.requiredPerHour, 
            available: availableCount,
          },
        });
        // Only report the first problematic hour in the window
        break;
      }
    }
  }

  return violations;
}

// =============================================================================
// CHECK 5: Can role min/max constraints be satisfied?
// =============================================================================
function checkRoleMinMaxFeasible(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const role of ctx.input.roles) {
    if (!role.minSlots && !role.maxSlots) continue;

    const blockMinutes = role.blockSize * ctx.input.store.baseSlotMinutes;
    const minMinutes = (role.minSlots ?? 0) * blockMinutes;
    const maxMinutes = (role.maxSlots ?? Infinity) * blockMinutes;

    // Check each crew that has this role
    const qualifiedCrew = ctx.crewByRole.get(role.id) ?? new Set();
    
    for (const crewId of qualifiedCrew) {
      const crew = ctx.crewById.get(crewId);
      if (!crew) continue;

      const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;

      // Check if minimum can be achieved
      if (minMinutes > 0 && minMinutes > shiftMinutes) {
        // Only a warning - crew might not be assigned this role at all
        violations.push({
          severity: 'warning',
          category: 'role-min-max',
          message: `${crew.name}'s ${(shiftMinutes / 60).toFixed(1)}h shift is too short for ${role.displayName}'s minimum of ${(minMinutes / 60).toFixed(1)}h. If assigned, they cannot meet the minimum.`,
          details: { 
            crewId: crew.id, 
            roleId: role.id, 
            minMinutes,
            shiftMinutes,
          },
        });
      }
    }
  }

  return violations;
}

// =============================================================================
// CHECK 6: Is the shift long enough for all mandatory role minimums combined?
// =============================================================================
function checkShiftLengthAccommodatesRequirements(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  // Group daily requirements by crew
  const dailyReqsByCrew = new Map<string, DailyRequirementDescriptor[]>();
  for (const req of ctx.input.dailyRequirements) {
    if (!dailyReqsByCrew.has(req.crewId)) {
      dailyReqsByCrew.set(req.crewId, []);
    }
    dailyReqsByCrew.get(req.crewId)!.push(req);
  }

  for (const [crewId, reqs] of dailyReqsByCrew.entries()) {
    const crew = ctx.crewById.get(crewId);
    if (!crew) continue;

    const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
    const totalRequiredMinutes = reqs.reduce((sum, r) => sum + r.requiredMinutes, 0);

    if (totalRequiredMinutes > shiftMinutes) {
      const roleNames = reqs
        .map(r => {
          const role = ctx.roleById.get(r.roleId);
          return role ? `${(r.requiredMinutes / 60).toFixed(1)}h ${role.displayName}` : '';
        })
        .filter(Boolean)
        .join(', ');

      violations.push({
        severity: 'error',
        category: 'shift-length',
        message: `${crew.name}'s daily requirements total ${(totalRequiredMinutes / 60).toFixed(1)}h (${roleNames}), but their shift is only ${(shiftMinutes / 60).toFixed(1)}h.`,
        details: { 
          crewId: crew.id, 
          totalRequiredMinutes,
          shiftMinutes,
          requirements: reqs.map(r => ({
            roleId: r.roleId,
            roleName: ctx.roleById.get(r.roleId)?.displayName,
            requiredMinutes: r.requiredMinutes,
          })),
        },
      });
    }
  }

  return violations;
}

// =============================================================================
// CHECK 7: Check for conflicting daily requirements (same crew, overlapping time needs)
// =============================================================================
function checkConflictingDailyRequirements(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  // Group daily requirements by crew
  const dailyReqsByCrew = new Map<string, DailyRequirementDescriptor[]>();
  for (const req of ctx.input.dailyRequirements) {
    if (!dailyReqsByCrew.has(req.crewId)) {
      dailyReqsByCrew.set(req.crewId, []);
    }
    dailyReqsByCrew.get(req.crewId)!.push(req);
  }

  // Also consider role minimums for roles the crew is qualified for
  for (const [crewId, dailyReqs] of dailyReqsByCrew.entries()) {
    const crew = ctx.crewById.get(crewId);
    if (!crew) continue;

    const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
    let totalMinimumMinutes = 0;

    // Add explicit daily requirements
    for (const req of dailyReqs) {
      totalMinimumMinutes += req.requiredMinutes;
    }

    // Add role minimums for qualified roles (only if they have minSlots)
    const rolesWithMinimums: { role: RoleDescriptor; minMinutes: number }[] = [];
    for (const roleId of crew.roleIds) {
      const role = ctx.roleById.get(roleId);
      if (!role || !role.minSlots) continue;
      
      // Skip if there's already a daily requirement for this role
      const hasDailyReq = dailyReqs.some(r => r.roleId === roleId);
      if (hasDailyReq) continue;

      const blockMinutes = role.blockSize * ctx.input.store.baseSlotMinutes;
      const minMinutes = role.minSlots * blockMinutes;
      rolesWithMinimums.push({ role, minMinutes });
    }

    // If there are roles with minimums AND daily requirements, check if they fit
    if (rolesWithMinimums.length > 0 && dailyReqs.length > 0) {
      const dailyReqMinutes = dailyReqs.reduce((sum, r) => sum + r.requiredMinutes, 0);
      const roleMinMinutes = rolesWithMinimums.reduce((sum, r) => sum + r.minMinutes, 0);
      const combinedMinimum = dailyReqMinutes + roleMinMinutes;

      if (combinedMinimum > shiftMinutes) {
        const dailyRoleNames = dailyReqs
          .map(r => {
            const role = ctx.roleById.get(r.roleId);
            return role ? `${(r.requiredMinutes / 60).toFixed(1)}h ${role.displayName}` : '';
          })
          .filter(Boolean)
          .join(', ');

        const minRoleNames = rolesWithMinimums
          .map(r => `${(r.minMinutes / 60).toFixed(1)}h ${r.role.displayName} (minimum)`)
          .join(', ');

        violations.push({
          severity: 'warning',
          category: 'conflicting-constraints',
          message: `${crew.name} may not be able to fulfill all role requirements. Daily assignments (${dailyRoleNames}) plus role minimums (${minRoleNames}) total ${(combinedMinimum / 60).toFixed(1)}h, but shift is only ${(shiftMinutes / 60).toFixed(1)}h.`,
          details: { 
            crewId: crew.id, 
            shiftMinutes,
            dailyRequirements: dailyReqs,
            roleMinimums: rolesWithMinimums.map(r => ({
              roleId: r.role.id,
              roleName: r.role.displayName,
              minMinutes: r.minMinutes,
            })),
          },
        });
      }
    }
  }

  return violations;
}

// =============================================================================
// CHECK 8: Can crew's shift be fully filled with their eligible roles?
// =============================================================================
function checkCrewShiftCanBeFilled(ctx: FeasibilityContext): FeasibilityViolation[] {
  const violations: FeasibilityViolation[] = [];

  for (const crew of ctx.input.crew) {
    const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
    
    // Get daily requirements for this crew (these are FIXED assignments - must be exactly this much)
    const dailyReqs = ctx.input.dailyRequirements.filter(r => r.crewId === crew.id);
    const dailyRoleIds = new Set(dailyReqs.map(r => r.roleId));
    
    // Calculate GUARANTEED minutes from roles that MUST be assigned
    // Only count:
    // 1. Daily constraints (fixed hours)
    // 2. Roles with minSlots > 0 (guaranteed minimum)
    // 
    // Do NOT count:
    // - Roles with minSlots = 0 (like Parking Helms, Demo, Wine Demo, Order Writer)
    //   because they might get 0 hours
    
    let guaranteedMinutes = 0;
    const roleBreakdown: { role: RoleDescriptor; maxMinutes: number; source: string }[] = [];
    
    for (const roleId of crew.roleIds) {
      const role = ctx.roleById.get(roleId);
      if (!role) continue;
      
      const blockMinutes = role.blockSize * ctx.input.store.baseSlotMinutes;
      const hasDailyReq = dailyRoleIds.has(roleId);
      
      let roleMaxMinutes = 0;
      let source = '';
      
      if (hasDailyReq) {
        // Daily requirement - this is a fixed amount that MUST be assigned
        const req = dailyReqs.find(r => r.roleId === roleId);
        roleMaxMinutes = req?.requiredMinutes ?? 0;
        source = 'daily-constraint';
      } else if (role.minSlots && role.minSlots > 0) {
        // Role has a guaranteed minimum - they WILL get at least minSlots
        // But they could get up to maxSlots (or entire shift if no max)
        if (role.maxSlots) {
          roleMaxMinutes = role.maxSlots * blockMinutes;
        } else {
          // No max slots defined - could theoretically fill entire shift
          roleMaxMinutes = shiftMinutes;
        }
        source = 'guaranteed-role (min > 0)';
      } else {
        // Role has minSlots = 0 or undefined - NOT guaranteed any time
        // Skip this role - can't count on it
        continue;
      }
      
      if (roleMaxMinutes > 0) {
        roleBreakdown.push({ role, maxMinutes: roleMaxMinutes, source });
        guaranteedMinutes += roleMaxMinutes;
      }
    }
    
    // If guaranteed minutes from bankable roles is less than shift, that's an error
    if (guaranteedMinutes < shiftMinutes) {
      const shortfall = shiftMinutes - guaranteedMinutes;
      
      // Build the breakdown string for roles that ARE counted
      const roleBreakdownStr = roleBreakdown
        .filter(r => r.maxMinutes > 0)
        .map(r => `${(r.maxMinutes / 60).toFixed(1)}h ${r.role.displayName}`)
        .join(', ') || 'none';
      
      // Find roles that were skipped (minSlots = 0)
      const skippedRoles: string[] = [];
      for (const roleId of crew.roleIds) {
        const role = ctx.roleById.get(roleId);
        if (!role) continue;
        const hasDailyReq = dailyRoleIds.has(roleId);
        if (!hasDailyReq && (!role.minSlots || role.minSlots === 0)) {
          skippedRoles.push(role.displayName);
        }
      }
      
      // Build note about skipped roles
      let skippedNote = '';
      if (skippedRoles.length > 0) {
        skippedNote = ` (Note: ${skippedRoles.join(', ')} not counted - minSlots is 0, so not guaranteed)`;
      }
      
      violations.push({
        severity: 'error',
        category: 'insufficient-constraints',
        message: `${crew.name}'s ${(shiftMinutes / 60).toFixed(1)}h shift cannot be filled. Guaranteed roles (${roleBreakdownStr}) only allow ${(guaranteedMinutes / 60).toFixed(1)}h maximum, leaving ${(shortfall / 60).toFixed(1)}h that cannot be assigned.${skippedNote}`,
        details: {
          crewId: crew.id,
          crewName: crew.name,
          shiftMinutes,
          guaranteedMinutes,
          shortfallMinutes: shortfall,
          roleBreakdown: roleBreakdown.map(r => ({
            roleId: r.role.id,
            roleName: r.role.displayName,
            maxMinutes: r.maxMinutes,
            source: r.source,
          })),
          skippedRoles,
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
 */
export function generateUnknownInfeasibilityMessage(input: SolverInputV2): string {
  const crewCount = input.crew.length;
  const roleCount = input.roles.length;
  const dailyReqCount = input.dailyRequirements.length;
  const hourlyReqCount = input.hourlyRequirements.length;
  const windowReqCount = input.windowRequirements.length;

  return `The schedule could not be generated. The combination of constraints (${dailyReqCount} daily assignments, ${hourlyReqCount} hourly requirements, ${windowReqCount} coverage windows) cannot be satisfied with the available ${crewCount} crew members and ${roleCount} roles. Try reducing coverage requirements or adding more crew shifts.`;
}
