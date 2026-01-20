'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/authStore';

interface AdminLayoutProps {
  children: ReactNode;
}

/**
 * Admin-only layout that protects all admin pages.
 * Only ADMIN users can access these pages.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isAdmin } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }

    if (!isAdmin()) {
      // Non-admin users go to their store
      if (user.storeId) {
        router.replace(`/stores/${user.storeId}/home`);
      } else {
        router.replace('/login');
      }
    }
  }, [isLoading, isAuthenticated, user, isAdmin, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0eee6' }}>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user || !isAdmin()) {
    return null;
  }

  return <>{children}</>;
}
