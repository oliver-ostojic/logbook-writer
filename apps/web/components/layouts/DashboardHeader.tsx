'use client';

import React from 'react';
import { UserIcon } from '@heroicons/react/20/solid';
import { aiGlassBorderStyle, aiGlassContentStyle, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '../ui/ai-glass';

export interface NavLink {
  label: string;
  href: string;
}

export interface DashboardHeaderProps {
  navLinks?: NavLink[];
  activeItem?: string;
  onUserClick?: () => void;
  lightMode?: boolean;
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
}) => {
  // Colors based on mode
  const activeColor = lightMode ? '#1a1a1a' : '#FFFFFF';
  const inactiveColor = lightMode ? '#6b7280' : '#9A999E';
  const hoverColor = lightMode ? '#1a1a1a' : '#FFFFFF';
  const iconColor = lightMode ? '#6b7280' : '#9A999E';
  const buttonBgDefault = lightMode ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.01)';
  const buttonBgHover = lightMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)';

  // Style functions based on mode
  const getBorderStyle = (radius: string) =>
    lightMode ? aiGlassLightBorderStyle(radius) : aiGlassBorderStyle(radius);
  const getContentStyle = (radius: string) =>
    lightMode ? aiGlassLightContentStyle(radius, 0.7) : aiGlassContentStyle(radius);

  return (
    <div className="fixed top-4 left-0 right-0 px-6 lg:px-8" style={{ zIndex: 200 }}>
      {/* Flex container: empty left spacer, centered nav, right-aligned user button */}
      <div className="flex items-center justify-between">
        {/* Left spacer - same width as user button for centering */}
        <div style={{ width: 48, height: 48 }} />

        {/* Centered nav menu */}
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

        {/* User account circle - right side */}
        <div
          className="ai-glass-border"
          style={{
            ...getBorderStyle('9999px'),
            width: 48,
            height: 48,
          }}
        >
          <button
            className="flex items-center justify-center transition-all"
            style={{
              ...getContentStyle('9999px'),
              background: buttonBgDefault,
              cursor: 'pointer',
              border: 'none',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = buttonBgHover}
            onMouseLeave={(e) => e.currentTarget.style.background = buttonBgDefault}
            onClick={onUserClick}
          >
            <UserIcon className="w-5 h-5" style={{ color: iconColor }} />
          </button>
        </div>
      </div>
    </div>
  );
};
