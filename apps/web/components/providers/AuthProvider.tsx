'use client';

import { useEffect, ReactNode } from 'react';
import { useAuthStore } from '@/lib/authStore';
import { getCurrentUser } from '@/lib/api/auth';

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider component that loads the current user on app mount.
 * Wrap the root layout with this provider.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const loadUser = async () => {
      try {
        setLoading(true);
        const response = await getCurrentUser();
        if (response) {
          setUser(response.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Failed to load user:', error);
        setUser(null);
      }
    };

    loadUser();
  }, [setUser, setLoading]);

  return <>{children}</>;
}
