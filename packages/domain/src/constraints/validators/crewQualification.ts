import type { ValidationResult, SolverAssignment } from '../types';

/**
 * Crew-to-role qualification mapping
 */
export interface CrewRoleQualification {
  crewId: string;
  roleId: number;
}

/**
 * Validates that crew members are only assigned to roles they're qualified for.
 * 
 * Rules:
 * - Each assignment must have a corresponding CrewRole record
 * - Crew cannot be assigned to roles they're not qualified for
 * 
 * Example:
 * - Crew "1234567" qualified for roles [1, 2, 3]
 * - Valid: Assignment to role 1, 2, or 3
 * - Invalid: Assignment to role 4 (not qualified)
 * 
 * @param assignments - All assignments to validate
 * @param qualifications - List of crew-role qualifications (from CrewRole table)
 * @param roleCodeMap - Map of roleId to roleCode for error messages
 * @returns Validation result with violations for unqualified assignments
 */
export function validateCrewQualifications(
  assignments: SolverAssignment[],
  qualifications: CrewRoleQualification[],
  roleCodeMap: Map<number, string>
): ValidationResult {
  const violations: string[] = [];

  // Build a Set of qualified crew-role pairs for fast lookup
  const qualificationSet = new Set<string>();
  for (const qual of qualifications) {
    qualificationSet.add(`${qual.crewId}:${qual.roleId}`);
  }

  // Check each assignment
  for (const assignment of assignments) {
    const key = `${assignment.crewId}:${assignment.roleId}`;
    
    if (!qualificationSet.has(key)) {
      const roleCode = roleCodeMap.get(assignment.roleId) || `Role#${assignment.roleId}`;
      violations.push(
        `Crew '${assignment.crewId}' is not qualified for role '${roleCode}' (roleId: ${assignment.roleId})`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Check if a specific crew member is qualified for a specific role.
 */
export function isCrewQualified(
  crewId: string,
  roleId: number,
  qualifications: CrewRoleQualification[]
): boolean {
  return qualifications.some(q => q.crewId === crewId && q.roleId === roleId);
}

/**
 * Get all roles a crew member is qualified for.
 */
export function getQualifiedRoles(
  crewId: string,
  qualifications: CrewRoleQualification[]
): number[] {
  return qualifications
    .filter(q => q.crewId === crewId)
    .map(q => q.roleId);
}

/**
 * Get all crew qualified for a specific role.
 */
export function getQualifiedCrew(
  roleId: number,
  qualifications: CrewRoleQualification[]
): string[] {
  return qualifications
    .filter(q => q.roleId === roleId)
    .map(q => q.crewId);
}

/**
 * Get qualification summary for debugging.
 */
export function getQualificationSummary(
  qualifications: CrewRoleQualification[]
): Map<string, number[]> {
  const summary = new Map<string, number[]>();
  
  for (const qual of qualifications) {
    const roles = summary.get(qual.crewId) || [];
    roles.push(qual.roleId);
    summary.set(qual.crewId, roles);
  }
  
  return summary;
}
