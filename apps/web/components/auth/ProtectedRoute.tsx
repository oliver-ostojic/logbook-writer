'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, UserRole } from '@/lib/authStore';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Roles that are allowed to access this route */
  allowedRoles?: UserRole[];
  /** Store ID from URL params - if provided, will verify user can access this store */
  storeId?: number;
  /** If true, CREW users can only access their own crew page */
  crewId?: string;
  /** Custom redirect path when not authenticated (default: /login) */
  redirectTo?: string;
  /** Custom redirect path when authenticated but not authorized (default: redirects to appropriate page) */
  unauthorizedRedirectTo?: string;
}

/**
 * ProtectedRoute component that handles authentication and authorization.
 *
 * Usage:
 * - Wrap page content to protect it
 * - Specify allowedRoles to restrict by role
 * - Specify storeId to verify store access
 * - CREW users will be auto-redirected to their crew page
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  storeId,
  crewId,
  redirectTo = '/login',
  unauthorizedRedirectTo,
}: ProtectedRouteProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const canAccessStore = useAuthStore((s) => s.canAccessStore);

  useEffect(() => {
    // Wait for auth to load
    if (isLoading) return;

    // Not authenticated - redirect to login
    if (!isAuthenticated || !user) {
      router.replace(redirectTo);
      return;
    }

    // Check role permission
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      // CREW users should only access their crew page
      if (user.role === 'CREW' && user.storeId && user.crewId) {
        router.replace(`/stores/${user.storeId}/crew/${user.crewId}`);
        return;
      }

      // Redirect to unauthorized page or default
      if (unauthorizedRedirectTo) {
        router.replace(unauthorizedRedirectTo);
      } else if (user.storeId) {
        router.replace(`/stores/${user.storeId}/home`);
      } else {
        router.replace('/login');
      }
      return;
    }

    // Check store access (ADMIN bypasses this)
    if (storeId && !canAccessStore(storeId)) {
      // Redirect to user's own store if they have one
      if (user.storeId) {
        router.replace(`/stores/${user.storeId}/home`);
      } else {
        router.replace('/login');
      }
      return;
    }

    // CREW can only access their own crew data
    if (user.role === 'CREW' && crewId && user.crewId !== crewId) {
      router.replace(`/stores/${user.storeId}/crew/${user.crewId}`);
      return;
    }
  }, [
    isLoading,
    isAuthenticated,
    user,
    allowedRoles,
    storeId,
    crewId,
    redirectTo,
    unauthorizedRedirectTo,
    canAccessStore,
    router,
  ]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'transparent' }}>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Not authenticated or not authorized - will redirect in useEffect
  if (!isAuthenticated || !user) {
    return null;
  }

  // Check role
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  // Check store access
  if (storeId && !canAccessStore(storeId)) {
    return null;
  }

  // Check crew access
  if (user.role === 'CREW' && crewId && user.crewId !== crewId) {
    return null;
  }

  return <>{children}</>;
}
