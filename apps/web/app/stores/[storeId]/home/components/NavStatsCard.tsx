'use client';

import React, { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';
import { aiGlassBorderStyle, aiGlassContentStyle, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

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
  /** Whether this is the first item (edge pill padding) */
  isFirst?: boolean;
  /** Whether this is the last item (edge pill padding) */
  isLast?: boolean;
  /** Hide subtext (for simpler nav items) */
  hideSubtext?: boolean;
  /** Compact mode - smaller circles, icons, and larger font (for top nav) */
  compact?: boolean;
  /** Text-only mode - no icons/circles, just text with hover highlight */
  textOnly?: boolean;
  /** Dark mode - light text on dark background */
  darkMode?: boolean;
  /** Custom active color (defaults to #2C2C2C in light mode, #DBDADB in dark mode) */
  activeColor?: string;
  /** Tutorial spotlight ID */
  tutorialId?: string;
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
  textOnly = false,
  darkMode = false,
  activeColor,
  tutorialId,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Circle and icon sizes based on compact mode
  const circleSize = compact ? 22 : 32;
  const iconSize = compact ? 'size-3' : 'size-4';
  const labelFontSize = textOnly ? '14px' : (compact ? '13px' : '15px');

  // Show highlight on active or hover
  const showHighlight = isActive || isHovered;

  return (
    <div
      className="flex items-center justify-center cursor-pointer"
      data-tutorial-id={tutorialId}
      style={{ position: 'relative', zIndex: 1, flex: 1, padding: textOnly ? '8px 0' : undefined }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* White glass pill overlay for active step or hover */}
      {showHighlight && (
        <div
          className="ai-glass-border"
          style={{
            ...(darkMode
              ? aiGlassBorderStyle('20px', '180, 170, 200', 0.15)
              : aiGlassLightBorderStyle('20px', '0, 0, 0', 0.08)),
            position: 'absolute',
            top: textOnly ? 0 : (compact ? -7 : -8),
            bottom: textOnly ? 0 : (compact ? -7 : -8),
            left: textOnly ? (isFirst ? 0 : 4) : (compact ? (isFirst ? -7 : 4) : (isFirst ? 0 : 4)),
            right: textOnly ? (isLast ? 0 : 4) : (compact ? (isLast ? -7 : 4) : (isLast ? 0 : 4)),
            zIndex: -1,
          }}
        >
          <div
            style={{
              ...(darkMode
                ? aiGlassContentStyle('20px', 0.85)
                : aiGlassLightContentStyle('20px', 1)),
              width: '100%',
              height: '100%',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              background: darkMode
                ? (isHovered && !isActive ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.25)')
                : (isHovered && !isActive
                    ? `rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.6) * 0.8333))`
                    : `rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.6) * 1.4167))`),
            }}
          />
        </div>
      )}

      {/* Circle with step number - hidden in textOnly mode and below lg */}
      {!textOnly && (
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
                style={{ color: '#2C2C2C' }}
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
      )}

      {/* Label and count subtext */}
      <div className={textOnly ? 'flex min-w-0 flex-col' : 'lg:ml-3 flex min-w-0 flex-col'}>
        <span
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: textOnly ? (isActive ? '15px' : '14px') : labelFontSize,
            fontWeight: isActive ? 600 : 400,
            color: darkMode
              ? (isActive ? (activeColor ?? '#DBDADB') : '#7C7F82')
              : (isActive ? (activeColor ?? '#2C2C2C') : '#9A999E'),
            transition: 'all 0.15s ease',
          }}
        >
          {label}
        </span>
        {!hideSubtext && !textOnly && (
          <span
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 400,
              color: darkMode ? '#7C7F82' : '#6B6B6B',
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
      margin: compact ? '0 28px' : '0 16px',
      alignSelf: 'center',
      flexShrink: 0,
    }}
  />
);
