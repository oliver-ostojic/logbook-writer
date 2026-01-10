'use client';

import React from 'react';
import { UserIcon } from '@heroicons/react/20/solid';
import { aiGlassBorderStyle, aiGlassContentStyle } from '../ui/ai-glass';

export interface NavLink {
  label: string;
  href: string;
}

export interface DashboardHeaderProps {
  navLinks?: NavLink[];
  activeItem?: string;
  onUserClick?: () => void;
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
}) => {
  return (
    <div className="fixed top-4 left-0 right-0 px-6 lg:px-8" style={{ zIndex: 200 }}>
      {/* Flex container: empty left spacer, centered nav, right-aligned user button */}
      <div className="flex items-center justify-between">
        {/* Left spacer - same width as user button for centering */}
        <div style={{ width: 48, height: 48 }} />

        {/* Centered nav menu */}
        <div className="ai-glass-border" style={{ ...aiGlassBorderStyle('9999px') }}>
          <nav
            style={{
              ...aiGlassContentStyle('9999px'),
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
                      color: isActive ? '#FFFFFF' : '#9A999E',
                      fontWeight: isActive ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.color = '#FFFFFF';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.color = '#9A999E';
                    }}
                  >
                    {link.label}
                  </a>
                );
              })}
            </div>
          </nav>
        </div>

        {/* User account circle - right side */}
        <div
          className="ai-glass-border"
          style={{
            ...aiGlassBorderStyle('9999px'),
            width: 48,
            height: 48,
          }}
        >
          <button
            className="flex items-center justify-center transition-all"
            style={{
              ...aiGlassContentStyle('9999px'),
              background: 'rgba(255, 255, 255, 0.01)',
              cursor: 'pointer',
              border: 'none',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)'}
            onClick={onUserClick}
          >
            <UserIcon className="w-5 h-5" style={{ color: '#9A999E' }} />
          </button>
        </div>
      </div>
    </div>
  );
};
