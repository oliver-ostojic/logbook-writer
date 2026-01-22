'use client';

import React, { useState } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from './styles';

export interface GlassPillProps {
  children: React.ReactNode;
  /** Whether this pill is currently selected */
  isSelected?: boolean;
  /** Click handler - if provided, pill becomes interactive */
  onClick?: () => void;
  /** Custom border radius (default: '1rem') */
  borderRadius?: string;
  /** Custom padding (default: '24px') */
  padding?: string;
  /** Background opacity when not selected (default: 0.6) */
  backgroundOpacity?: number;
  /** Border opacity when not selected (default: 0.08) */
  borderOpacity?: number;
  /** Brightness filter when selected (default: 0.94) */
  selectedBrightness?: number;
  /** Scale transform when selected (default: 1.02) */
  selectedScale?: number;
  /** Additional className */
  className?: string;
  /** Additional style for outer container */
  style?: React.CSSProperties;
  /** Additional style for inner content */
  contentStyle?: React.CSSProperties;
}

/**
 * GlassPill - A glass-effect pill/card component
 *
 * When onClick is provided, it becomes an interactive button with hover states.
 * When selected, it becomes solid white with no gradient border.
 */
export const GlassPill: React.FC<GlassPillProps> = ({
  children,
  isSelected = false,
  onClick,
  borderRadius = '1rem',
  padding = '24px',
  backgroundOpacity = 0.4,
  borderOpacity = 0.08,
  selectedBrightness = 0.94,
  selectedScale = 1.02,
  className = '',
  style,
  contentStyle,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const isInteractive = !!onClick;

  // Hover just bumps opacity slightly, selected goes fully opaque
  const contentOpacity = isSelected ? 1 : (isInteractive && isHovered) ? backgroundOpacity + 0.15 : backgroundOpacity;

  return (
    <div
      className={`ai-glass-border ${className}`}
      style={{
        ...aiGlassLightBorderStyle(borderRadius, '0, 0, 0', isSelected ? 0 : borderOpacity),
        cursor: isInteractive ? 'pointer' : 'default',
        transition: 'filter 0.2s ease, transform 0.2s ease',
        ...(isSelected && {
          filter: `brightness(${selectedBrightness})`,
          transform: `scale(${selectedScale})`,
        }),
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="flex items-center justify-center h-full"
        style={{
          ...aiGlassLightContentStyle(borderRadius, contentOpacity),
          padding,
          transition: 'background 0.2s ease',
          ...(isSelected && {
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }),
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export interface GlassPillButtonProps extends Omit<GlassPillProps, 'onClick'> {
  /** Click handler (required for button) */
  onClick: () => void;
}

/**
 * GlassPillButton - An interactive glass pill button
 *
 * Same as GlassPill but with required onClick.
 */
export const GlassPillButton: React.FC<GlassPillButtonProps> = (props) => {
  return <GlassPill {...props} />;
};

export interface GlassPillCardProps extends Omit<GlassPillProps, 'onClick' | 'isSelected'> {}

/**
 * GlassPillCard - A non-interactive glass pill card
 *
 * Same as GlassPill but without click handling or selection state.
 */
export const GlassPillCard: React.FC<GlassPillCardProps> = (props) => {
  return <GlassPill {...props} isSelected={false} onClick={undefined} />;
};
