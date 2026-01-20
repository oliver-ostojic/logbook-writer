'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserIcon, ArrowRightOnRectangleIcon, BuildingStorefrontIcon } from '@heroicons/react/20/solid';
import { aiGlassBorderStyle, aiGlassContentStyle, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '../ui/ai-glass';
import { useAuthStore } from '@/lib/authStore';
import { logout } from '@/lib/api/auth';

export interface NavLink {
  label: string;
  href: string;
}

export interface DashboardHeaderProps {
  navLinks?: NavLink[];
  activeItem?: string;
  onUserClick?: () => void;
  lightMode?: boolean;
  /** Whether the header should be sticky (fixed position). Default: true */
  sticky?: boolean;
}

const DEFAULT_NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Dashboard', href: '#' },
  { label: 'Settings', href: '#' },
];

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  navLinks = DEFAULT_NAV_LINKS,
  activeItem,
  onUserClick,
  lightMode = false,
  sticky = true,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout: logoutStore } = useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [storeCompanyId, setStoreCompanyId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check if we're on an admin page
  const isAdminPage = pathname?.startsWith('/admin');

  // Extract storeId from current path if on a store page
  const storeMatch = pathname?.match(/\/stores\/(\d+)/);
  const currentStoreId = storeMatch ? storeMatch[1] : null;

  // Fetch store's company ID when on a store page (for ADMIN "Back to stores" navigation)
  useEffect(() => {
    if (currentStoreId && user?.role === 'ADMIN') {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      fetch(`${API_URL}/stores/${currentStoreId}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.companyId) {
            setStoreCompanyId(data.companyId);
          }
        })
        .catch(() => {});
    }
  }, [currentStoreId, user?.role]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      logoutStore();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleUserButtonClick = () => {
    if (onUserClick) {
      onUserClick();
    } else {
      setIsMenuOpen(!isMenuOpen);
    }
  };

  // Colors based on mode
  const activeColor = lightMode ? '#1a1a1a' : '#FFFFFF';
  const inactiveColor = lightMode ? '#6b7280' : '#9A999E';
  const hoverColor = lightMode ? '#1a1a1a' : '#FFFFFF';
  const iconColor = lightMode ? '#6b7280' : '#9A999E';

  // Style functions based on mode
  const getBorderStyle = (radius: string) =>
    lightMode ? aiGlassLightBorderStyle(radius) : aiGlassBorderStyle(radius);
  const getContentStyle = (radius: string) =>
    lightMode ? aiGlassLightContentStyle(radius, 0.7) : aiGlassContentStyle(radius);

  return (
    <div
      className={`${sticky ? 'fixed top-4' : 'pt-4'} left-0 right-0 px-6 lg:px-8`}
      style={{ zIndex: sticky ? 200 : 'auto', position: sticky ? 'fixed' : 'relative' }}
    >
      {/* Flex container: empty left spacer, centered nav, right-aligned user button */}
      <div className="flex items-center justify-between">
        {/* Left spacer - same width as user button for centering (only when nav is shown) */}
        {navLinks.length > 0 && <div style={{ width: 48, height: 48 }} />}

        {/* Centered nav menu - only show if there are nav links */}
        {navLinks.length > 0 ? (
          <div className="ai-glass-border" style={{ ...getBorderStyle('9999px') }}>
            <nav
              style={{
                ...getContentStyle('9999px'),
                padding: '12px 36px',
              }}
            >
              <div className="flex items-center gap-9">
                {navLinks.map((link) => {
                  const isActive = activeItem === link.label;
                  return (
                    <a
                      key={link.label}
                      href={link.href}
                      className="text-base transition-colors"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: isActive ? activeColor : inactiveColor,
                        fontWeight: isActive ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.color = hoverColor;
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.color = inactiveColor;
                      }}
                    >
                      {link.label}
                    </a>
                  );
                })}
              </div>
            </nav>
          </div>
        ) : (
          // Spacer to push user button to the right when no nav
          <div style={{ flex: 1 }} />
        )}

        {/* User account circle - right side with dropdown menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div
            className="ai-glass-border"
            style={{
              ...getBorderStyle('9999px'),
            }}
          >
            <button
              className="flex items-center justify-center transition-all"
              style={{
                ...getContentStyle('9999px'),
                width: 48,
                height: 48,
                cursor: 'pointer',
                border: 'none',
                transition: 'background 0.2s ease, filter 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.94)'}
              onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
              onClick={handleUserButtonClick}
            >
              <UserIcon className="w-5 h-5" style={{ color: iconColor }} />
            </button>
          </div>

          {/* Dropdown menu */}
          {isMenuOpen && !onUserClick && (
            <div
              className="ai-glass-border"
              style={{
                ...aiGlassLightBorderStyle('1rem'),
                position: 'absolute',
                top: '56px',
                right: 0,
                minWidth: '200px',
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  ...aiGlassLightContentStyle('1rem', 0.95),
                  padding: '8px',
                }}
              >
                {/* User info */}
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

                {/* Menu items */}
                {/* Show "Back to stores" only for ADMIN when viewing a store (not on admin pages) */}
                {user?.role === 'ADMIN' && !isAdminPage && currentStoreId && (
                  <button
                    onClick={() => {
                      // Navigate to the company's stores page if we have the companyId, otherwise go to admin
                      if (storeCompanyId) {
                        router.push(`/admin/companies/${storeCompanyId}`);
                      } else {
                        router.push('/admin');
                      }
                    }}
                    className="w-full flex items-center gap-3 transition-all"
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
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <BuildingStorefrontIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
                    Back to stores
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 transition-all"
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
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
