import React from 'react';
import { aiGlassBorderStyle, aiGlassContentStyle, aiGlassLightBorderStyle, aiGlassLightContentStyle } from './styles';

/**
 * CardContainer - Container card that holds other cards
 * Default: Flexible dimensions, no min-height
 * Use for: Grouping multiple cards, creating nested layouts, carousels
 * Typically contains a flex or grid layout with gap spacing
 */
export interface CardContainerProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number;
  padding?: string | number; // Default: 1rem
  lightMode?: boolean; // Default: false
}

export const CardContainer: React.FC<CardContainerProps> = ({
  children,
  borderRadius = '1rem',
  className = '',
  style = {},
  contentStyle = {},
  borderColor,
  borderOpacity,
  padding = '1rem',
  lightMode = false,
}) => {
  const paddingValue = typeof padding === 'number' ? `${padding}px` : padding;

  // Default opacity based on mode
  const defaultBorderOpacity = lightMode ? 0.08 : 0.11;
  const defaultContentOpacity = lightMode ? 0.6 : 0.85;

  const finalBorderColor = borderColor ?? (lightMode ? '0, 0, 0' : '255, 255, 255');
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
      className="ai-glass-border"
      style={{
        ...borderStyle,
        ...style,
      }}
    >
      <div
        className={className}
        style={{
          ...contentBaseStyle,
          padding: paddingValue,
          height: '100%',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};
