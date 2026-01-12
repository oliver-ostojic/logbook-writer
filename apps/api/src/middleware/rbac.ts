import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export type UserRole = 'mate' | 'captain' | 'admin';

export interface RBACOptions {
  allowedRoles: UserRole[];
}

/**
 * Simple header-based RBAC middleware for Fastify
 *
 * Checks the x-user-role header to determine user permissions.
 * In production, this should be replaced with proper JWT/session-based auth.
 *
 * Role hierarchy:
 * - admin: Full access to all operations
 * - captain: Full CRUD on crew/roles, but cannot C/D CrewRoleRules (preferences)
 * - mate: Same as captain
 */
export function rbacMiddleware(options: RBACOptions) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) => {
    const userRole = (request.headers['x-user-role'] as UserRole) || 'mate';

    if (!options.allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
        requiredRoles: options.allowedRoles,
        currentRole: userRole,
      });
    }

    // Attach role to request for downstream use
    (request as any).userRole = userRole;
  };
}

/**
 * Check if user can manage crew preferences (CrewRoleRules)
 * Only admin can create/delete crew preferences
 */
export function canManageCrewPreferences(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Check if user can perform full CRUD on crew/roles
 * All roles (mate, captain, admin) can do this
 */
export function canManageCrew(role: UserRole): boolean {
  return ['mate', 'captain', 'admin'].includes(role);
}

/**
 * Get user role from request headers
 */
export function getUserRole(request: FastifyRequest): UserRole {
  return (request.headers['x-user-role'] as UserRole) || 'mate';
}
