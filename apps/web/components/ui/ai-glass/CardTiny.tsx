import React from 'react';
import { aiGlassBorderStyle, aiGlassContentStyle } from './styles';

/**
 * CardTiny - Button-sized card container
 * Default: 48px x 48px (3rem x 3rem)
 * Use for: Icon buttons, compact controls, mini stat indicators
 */
export interface CardTinyProps {
  children: React.ReactNode;
  size?: number | string; // Default: 48px (3rem)
  borderRadius?: string | number; // Default: 0.75rem
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  onClick?: () => void;
  borderColor?: string;
  borderOpacity?: number;
}

export const CardTiny: React.FC<CardTinyProps> = ({
  children,
  size = '3rem',
  borderRadius = '0.75rem',
  className = '',
  style = {},
  contentStyle = {},
  onClick,
  borderColor,
  borderOpacity = 0.08,
}) => {
  const sizeValue = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`ai-glass-border ${onClick ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
      style={{
        ...aiGlassBorderStyle(borderRadius, borderColor, borderOpacity),
        width: sizeValue,
        height: sizeValue,
        ...style,
      }}
      onClick={onClick}
    >
      <div
        className={`ai-glass-content ${className}`}
        style={{
          ...aiGlassContentStyle(borderRadius, 0.85),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};
