import React from 'react';
import { aiGlassBorderStyle, aiGlassContentStyle, aiGlassLightBorderStyle, aiGlassLightContentStyle } from './styles';

/**
 * CardHeader - Section header card with title and optional controls
 * Layout: [Left controls] [Center title] [Right controls]
 * Use for: Section headers with dropdowns, action buttons, filters
 */
export interface CardHeaderProps {
  // Content
  title: string | React.ReactNode;
  leftContent?: React.ReactNode; // Dropdown, back button, etc.
  rightContent?: React.ReactNode; // Action buttons, filters, etc.

  // Styling
  borderRadius?: string | number; // Default: 1rem
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number; // Default: 0.15 (dark), 0.08 (light)
  lightMode?: boolean; // Default: false

  // Title styling
  titleClassName?: string;
  titleStyle?: React.CSSProperties;

  // Layout
  padding?: string | number; // Default: 1rem (16px)
  gap?: string | number; // Gap between left/center/right, default: 1rem
  align?: 'left' | 'center' | 'right'; // Default: center
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  leftContent,
  rightContent,
  borderRadius = '1rem',
  className = '',
  style = {},
  contentStyle = {},
  borderColor,
  borderOpacity,
  lightMode = false,
  titleClassName = '',
  titleStyle = {},
  padding = '1.5rem',
  gap = '1rem',
  align = 'center',
}) => {
  const paddingValue = typeof padding === 'number' ? `${padding}px` : padding;
  const gapValue = typeof gap === 'number' ? `${gap}px` : gap;

  // Default colors based on mode
  const defaultBorderColor = lightMode ? '0, 0, 0' : '180, 170, 200';
  const defaultBorderOpacity = lightMode ? 0.08 : 0.15;
  const defaultContentOpacity = lightMode ? 0.6 : 0.85;

  const finalBorderColor = borderColor ?? defaultBorderColor;
  const finalBorderOpacity = borderOpacity ?? defaultBorderOpacity;

  // Choose styles based on mode
  const borderStyle = lightMode
    ? aiGlassLightBorderStyle(borderRadius, finalBorderColor, finalBorderOpacity)
    : aiGlassBorderStyle(borderRadius, finalBorderColor, finalBorderOpacity);

  const contentBaseStyle = lightMode
    ? aiGlassLightContentStyle(borderRadius, defaultContentOpacity)
    : aiGlassContentStyle(borderRadius, defaultContentOpacity);

  return (
    <div
      className={`ai-glass-border ${className}`}
      style={{
        ...borderStyle,
        ...style,
      }}
    >
      <div
        style={{
          ...contentBaseStyle,
          padding: paddingValue,
          ...contentStyle,
        }}
      >
        <div
          className={`relative flex items-center ${align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center'}`}
          style={{ gap: gapValue }}
        >
          {/* Left content */}
          {leftContent && (
            <div className="absolute" style={{ left: '-6px', zIndex: 50 }}>
              {leftContent}
            </div>
          )}

          {/* Center title */}
          <div
            className={titleClassName}
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '16px',
              fontWeight: 600,
              color: '#DBDADB',
              ...titleStyle,
            }}
          >
            {title}
          </div>

          {/* Right content */}
          {rightContent && (
            <div className="absolute right-0" style={{ zIndex: 50 }}>
              {rightContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
