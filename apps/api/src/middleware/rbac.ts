import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
import { AUTH_CONFIG, JWTPayload } from '../config/auth.config';

// Re-export UserRole from Prisma for convenience
export { UserRole };

export interface RBACOptions {
  /** Roles allowed to access this route */
  allowedRoles: UserRole[];
  /** If true, verify the user can access the :storeId in the URL params */
  requireStoreAccess?: boolean;
  /** If true, CREW users can only access their own :crewId in the URL params */
  requireCrewAccess?: boolean;
}

// Extend FastifyRequest to include user info
declare module 'fastify' {
  interface FastifyRequest {
    authUser?: JWTPayload;
  }
}

/**
 * JWT-based RBAC middleware for Fastify
 *
 * Extracts user from JWT cookie and validates:
 * 1. User is authenticated
 * 2. User's role is in allowedRoles
 * 3. (Optional) User can access the store in URL params
 * 4. (Optional) CREW users can only access their own crew data
 */
export function rbacMiddleware(options: RBACOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract JWT from cookie
    const token = request.cookies[AUTH_CONFIG.jwt.cookieName];
    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Verify JWT
    let payload: JWTPayload;
    try {
      payload = request.server.jwt.verify<JWTPayload>(token);
    } catch {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Attach user to request
    request.authUser = payload;

    // Check role permission
    if (!options.allowedRoles.includes(payload.role as UserRole)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
        requiredRoles: options.allowedRoles,
        currentRole: payload.role,
      });
    }

    // Store access check (skip for ADMIN - they have global access)
    if (options.requireStoreAccess && payload.role !== 'ADMIN') {
      const storeId = parseInt((request.params as any).storeId, 10);
      if (!isNaN(storeId) && payload.storeId !== storeId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'You do not have access to this store',
        });
      }
    }

    // Crew access check (CREW can only access their own crew data)
    if (options.requireCrewAccess && payload.role === 'CREW') {
      const crewId = (request.params as any).crewId;
      if (crewId && payload.crewId !== crewId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'You can only access your own crew data',
        });
      }
    }
  };
}

/**
 * Authentication-only middleware (no role check)
 * Just ensures the user is logged in
 */
export function authMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[AUTH_CONFIG.jwt.cookieName];
    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    try {
      const payload = request.server.jwt.verify<JWTPayload>(token);
      request.authUser = payload;
    } catch {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  };
}

/**
 * Check if user can manage crew preferences (CrewRoleRules)
 * CAPTAIN and ADMIN can manage preferences
 */
export function canManageCrewPreferences(role: UserRole): boolean {
  return role === 'CAPTAIN' || role === 'ADMIN';
}

/**
 * Check if user can perform full CRUD on crew/roles
 * MATE, CAPTAIN, and ADMIN can do this
 */
export function canManageCrew(role: UserRole): boolean {
  return role === 'MATE' || role === 'CAPTAIN' || role === 'ADMIN';
}

/**
 * Check if user can manage users for a store
 * CAPTAIN (for their store) and ADMIN (globally)
 */
export function canManageUsers(role: UserRole): boolean {
  return role === 'CAPTAIN' || role === 'ADMIN';
}

/**
 * Check if user can edit schedules/logbooks
 * MATE, CAPTAIN, and ADMIN can do this
 */
export function canEditSchedule(role: UserRole): boolean {
  return role === 'MATE' || role === 'CAPTAIN' || role === 'ADMIN';
}

/**
 * Check if user is an admin with global access
 */
export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN';
}

/**
 * Get user from request (must be called after auth middleware)
 */
export function getUser(request: FastifyRequest): JWTPayload | undefined {
  return request.authUser;
}

/**
 * Get user role from request (must be called after auth middleware)
 */
export function getUserRole(request: FastifyRequest): UserRole | undefined {
  return request.authUser?.role as UserRole | undefined;
}
