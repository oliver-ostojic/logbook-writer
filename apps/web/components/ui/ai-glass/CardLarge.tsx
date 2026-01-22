import React from 'react';
import { aiGlassBorderStyle, aiGlassContentStyle } from './styles';

/**
 * CardLarge - Large section card
 * Default: Flexible width, min-height 500px
 * Use for: Major dashboard sections, full-height sidebars, hero sections
 * Often used with fixed widths (e.g., 380px sidebar) or flex-1 for main content
 */
export interface CardLargeProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  minHeight?: string | number; // Default: 500px
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number;
}

export const CardLarge: React.FC<CardLargeProps> = ({
  children,
  borderRadius = '1rem',
  minHeight = '500px',
  className = '',
  style = {},
  contentStyle = {},
  borderColor,
  borderOpacity = 0.11,
}) => {
  const minHeightValue = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;

  return (
    <div
      className="ai-glass-border"
      style={{
        ...aiGlassBorderStyle(borderRadius, borderColor, borderOpacity),
        minHeight: minHeightValue,
        ...style,
      }}
    >
      <div
        className={`ai-glass-content ${className}`}
        style={{
          ...aiGlassContentStyle(borderRadius, 0.85),
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};
