'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { NavStatsCard } from './NavStatsCard';
import { useAuthStore } from '@/lib/authStore';
import { logout } from '@/lib/api/auth';

interface TopNavHeaderProps {
  storeId: string;
  activeNav: 'home' | 'dashboard' | 'settings';
  onNavChange?: (tab: 'home' | 'dashboard' | 'settings') => void;
}

export function TopNavHeader({ storeId, activeNav, onNavChange }: TopNavHeaderProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logoutStore = useAuthStore((s) => s.logout);

  // Defer navigation to a macrotask so it escapes the current render cycle.
  // Heavy detail views in the parent can starve App Router transitions; deferring
  // lets the click's state changes flush before the route push runs.
  const navigate = (path: string) => setTimeout(() => router.push(path), 0);
  const handleNavClick = (tab: 'home' | 'dashboard' | 'settings', path: string) => {
    if (onNavChange) {
      onNavChange(tab);
    } else {
      navigate(path);
    }
  };
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isOutsideButton = userMenuRef.current && !userMenuRef.current.contains(target);
      const isOutsideDropdown = userDropdownRef.current && !userDropdownRef.current.contains(target);
      if (isOutsideButton && isOutsideDropdown) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update dropdown position on window resize/scroll
  useEffect(() => {
    if (!isUserMenuOpen) return;

    const updatePosition = () => {
      if (userDropdownRef.current && userMenuRef.current) {
        const rect = userMenuRef.current.getBoundingClientRect();
        const parentRect = userDropdownRef.current.offsetParent?.getBoundingClientRect();

        if (parentRect) {
          userDropdownRef.current.style.top = `${rect.bottom - parentRect.top + 15}px`;
          userDropdownRef.current.style.left = `${rect.left - parentRect.left}px`;
          userDropdownRef.current.style.width = `${rect.width}px`;
        }
      }
    };

    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [isUserMenuOpen]);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    try {
      await logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    logoutStore();
    router.push('/login');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Top nav - bento style header */}
      <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
        <div
          data-tutorial-id="top-nav"
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08),
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
              padding: '8px',
            }}
          >
            {/* Main nav - 4 equal segments */}
            <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '100%' }}>
              <NavStatsCard
                label="Home"
                textOnly
                isActive={activeNav === 'home'}
                onClick={() => handleNavClick('home', `/stores/${storeId}/home`)}
                isFirst
              />
              <NavStatsCard
                label="System Health"
                textOnly
                isActive={activeNav === 'dashboard'}
                onClick={() => handleNavClick('dashboard', `/stores/${storeId}/fairness-dashboard`)}
              />
              <NavStatsCard
                label="Settings"
                textOnly
                isActive={activeNav === 'settings'}
                onClick={() => handleNavClick('settings', `/stores/${storeId}/settings`)}
              />
              <div ref={userMenuRef} style={{ display: 'flex' }}>
                <NavStatsCard
                  label="Account"
                  textOnly
                  isActive={isUserMenuOpen}
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  isLast
                />
              </div>
            </nav>
          </div>
        </div>
      </div>

      {/* User dropdown menu - rendered at root level with fixed positioning */}
      {isUserMenuOpen && userMenuRef.current && (
        <div
          ref={(el) => {
            userDropdownRef.current = el;
            if (el && userMenuRef.current) {
              const rect = userMenuRef.current.getBoundingClientRect();
              const parentRect = el.offsetParent?.getBoundingClientRect();

              if (parentRect) {
                el.style.top = `${rect.bottom - parentRect.top + 15}px`;
                el.style.left = `${rect.left - parentRect.left}px`;
                el.style.width = `${rect.width}px`;
              }
            }
          }}
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1rem'),
            position: 'absolute',
            zIndex: 99999,
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1rem', 0.95),
              padding: '8px',
              position: 'relative',
              zIndex: 5,
            }}
          >
            {user && (
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#2C2C2C',
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: '#6B6B6B',
                    marginTop: '2px',
                  }}
                >
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                </div>
              </div>
            )}
            {/* Back to stores - only for ADMIN */}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  router.push('/admin');
                }}
                className="w-full transition-all"
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#2C2C2C',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Back to stores
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full transition-all"
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                color: '#2C2C2C',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
