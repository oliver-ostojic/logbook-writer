'use client';

import { ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import type { UserRole } from '@/lib/authStore';
import { useAvailableDates } from '@/lib/hooks/useAvailableDates';
import { useDashboardData } from '@/lib/hooks/useDashboardData';

const CREW_PAGE_ROLES: UserRole[] = ['CREW', 'MATE', 'CAPTAIN', 'ADMIN'];
const STORE_PAGE_ROLES: UserRole[] = ['MATE', 'CAPTAIN', 'ADMIN'];

interface StoreLayoutProps {
  children: ReactNode;
}

/**
 * Store-level layout that protects all store pages.
 *
 * Access rules:
 * - CREW: Can only access their own crew page (/stores/[storeId]/crew/[crewId])
 * - MATE/CAPTAIN: Can access all pages within their store
 * - ADMIN: Can access all pages across all stores
 */
export default function StoreLayout({ children }: StoreLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const storeId = params.storeId ? parseInt(params.storeId as string, 10) : undefined;
  const storeIdStr = params.storeId ? (params.storeId as string) : undefined;

  // Prefetch dashboard data while the user is on any store page so that navigating
  // to the fairness-dashboard tab finds the data already in the React Query cache.
  const { data: prefetchDates = [] } = useAvailableDates(storeIdStr);
  useDashboardData(storeIdStr, prefetchDates);

  // Extract crewId from pathname if on a crew page
  // Pattern: /stores/[storeId]/crew/[crewId]
  const crewMatch = pathname.match(/\/stores\/\d+\/crew\/([^/]+)/);
  const crewId = crewMatch ? crewMatch[1] : undefined;

  // Determine allowed roles based on the current path
  // CREW can only access /stores/[storeId]/crew/[crewId] (their own crew page)
  const isCrewPage = crewId !== undefined;

  // For crew pages, allow all roles but enforce crewId check for CREW users
  // For other pages, only allow MATE, CAPTAIN, ADMIN
  const allowedRoles = isCrewPage ? CREW_PAGE_ROLES : STORE_PAGE_ROLES;

  return (
    <ProtectedRoute
      allowedRoles={allowedRoles}
      storeId={storeId}
      crewId={crewId}
    >
      {children}
    </ProtectedRoute>
  );
}
