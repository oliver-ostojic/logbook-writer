'use client';

import React from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

export interface NavStatsCardProps {
  /** Step number to show in circle (01, 02, etc.) - not used if icon is provided */
  stepNumber?: string;
  /** Icon to show instead of step number (optional) */
  icon?: React.ReactNode;
  /** Label name (e.g., "Crew", "Logbooks") */
  label: string;
  /** Count to show as "X total" subtext (optional) */
  count?: number;
  /** Custom subtext (overrides count) */
  subtext?: string;
  /** Whether this step is currently active */
  isActive?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Whether this is the first item (for red pill left padding) */
  isFirst?: boolean;
  /** Whether this is the last item (for red pill right padding) */
  isLast?: boolean;
  /** Hide subtext (for simpler nav items) */
  hideSubtext?: boolean;
  /** Compact mode - smaller circles, icons, and larger font (for top nav) */
  compact?: boolean;
}

/**
 * NavStatsCard - Navigation card styled exactly like ProgressBar steps
 * Circle with step number, label name, and "X total" subtext
 */
export const NavStatsCard: React.FC<NavStatsCardProps> = ({
  stepNumber,
  icon,
  label,
  count,
  subtext,
  isActive = false,
  onClick,
  isFirst = false,
  isLast = false,
  hideSubtext = false,
  compact = false,
}) => {
  // Circle and icon sizes based on compact mode
  const circleSize = compact ? 22 : 32;
  const iconSize = compact ? 'size-3' : 'size-4';
  const labelFontSize = compact ? '13px' : '15px';
  return (
    <div
      className="flex items-center justify-center cursor-pointer"
      style={{ position: 'relative', zIndex: 1, flex: 1 }}
      onClick={onClick}
    >
      {/* Red tinted glass pill overlay for active step */}
      {isActive && (
        <div
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1.5rem', '220, 38, 38', 0.25),
            position: 'absolute',
            top: compact ? -7 : -16,
            bottom: compact ? -7 : -16,
            left: isFirst ? (compact ? -7 : -32) : isLast ? (compact ? -20 : -20) : (compact ? -20 : -20),
            right: isLast ? (compact ? -7 : -32) : isFirst ? (compact ? -20 : -20) : (compact ? -20 : -20),
            zIndex: -1,
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1.5rem', 1),
              width: '100%',
              height: '100%',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              background: 'hsla(var(--brand-h), var(--brand-s), var(--brand-l), 0.12)',
            }}
          />
        </div>
      )}

      {/* Circle with step number - hidden below lg */}
      <div
        className="ai-glass-border shrink-0 hidden lg:block"
        style={{
          ...aiGlassLightBorderStyle('9999px', '0, 0, 0', isActive ? 0 : 0.08),
          width: circleSize,
          height: circleSize,
        }}
      >
        <div
          style={{
            ...aiGlassLightContentStyle('9999px', isActive ? 1 : 0.6),
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...(isActive && {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }),
          }}
        >
          {isActive ? (
            <CheckIcon
              aria-hidden="true"
              className={iconSize}
              style={{ color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))' }}
            />
          ) : icon ? (
            <div
              className={iconSize}
              style={{ color: '#6B6B6B' }}
            >
              {icon}
            </div>
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: compact ? '11px' : '14px',
                fontWeight: 500,
                color: '#6B6B6B',
              }}
            >
              {stepNumber}
            </span>
          )}
        </div>
      </div>

      {/* Label and count subtext */}
      <div className="lg:ml-3 flex min-w-0 flex-col">
        <span
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: labelFontSize,
            fontWeight: 500,
            color: isActive
              ? 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))'
              : '#2C2C2C',
          }}
        >
          {label}
        </span>
        {!hideSubtext && (
          <span
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 400,
              color: '#6B6B6B',
            }}
          >
            {subtext ?? (count !== undefined ? `${count} total` : '')}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Faded vertical line divider between nav cards
 */
export const NavDivider: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    style={{
      width: 1,
      height: compact ? 40 : 55,
      background: compact
        ? 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 33%, rgba(0,0,0,0.1) 67%, transparent 100%)'
        : 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 20%, rgba(0,0,0,0.08) 80%, transparent 100%)',
      margin: compact ? '0 28px' : '0 20px',
      alignSelf: 'center',
      flexShrink: 0,
    }}
  />
);
