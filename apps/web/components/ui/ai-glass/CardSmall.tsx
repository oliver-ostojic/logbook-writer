import React from 'react';
import { aiGlassBorderStyle, aiGlassContentStyle, aiGlassLightBorderStyle, aiGlassLightContentStyle } from './styles';

/**
 * CardSmall - Quick look card size
 * Default: Flexible width/height, typically used in 2x2 or 3x3 grids
 * Use for: Quick stats, mini metrics, compact info displays
 * Common grid usage: grid-cols-2 or grid-cols-3 with gap-3
 */
export interface CardSmallProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  onClick?: () => void;
  borderColor?: string;
  borderOpacity?: number;
  lightMode?: boolean; // Default: false
}

export const CardSmall: React.FC<CardSmallProps> = ({
  children,
  borderRadius = '1rem',
  className = '',
  style = {},
  contentStyle = {},
  onClick,
  borderColor,
  borderOpacity,
  lightMode = false,
}) => {
  // Default opacity based on mode
  const defaultBorderOpacity = lightMode ? 0.08 : 0.08;
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

  // Different hover effects for light vs dark mode
  const hoverClass = onClick
    ? lightMode
      ? 'cursor-pointer hover:brightness-95 hover:scale-[1.02] transition-all duration-200'
      : 'cursor-pointer hover:brightness-110 transition-all duration-200'
    : '';

  return (
    <div
      className={`ai-glass-border ${hoverClass}`}
      style={{
        ...borderStyle,
        ...style,
      }}
      onClick={onClick}
    >
      <div
        className={className}
        style={{
          ...contentBaseStyle,
          padding: '1rem',
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
