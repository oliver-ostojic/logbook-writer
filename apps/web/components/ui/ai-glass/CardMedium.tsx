import React from 'react';
import { aiGlassBorderStyle, aiGlassContentStyle } from './styles';

/**
 * CardMedium - Standard content card
 * Default: Flexible width, min-height 300px
 * Use for: Graphs, tables, lists, standard content blocks
 * Typically spans 1-2 columns in a grid layout
 */
export interface CardMediumProps {
  children: React.ReactNode;
  borderRadius?: string | number; // Default: 1rem
  minHeight?: string | number; // Default: 300px
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  borderColor?: string;
  borderOpacity?: number;
}

export const CardMedium: React.FC<CardMediumProps> = ({
  children,
  borderRadius = '1rem',
  minHeight = '300px',
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
        className={className}
        style={{
          ...aiGlassContentStyle(borderRadius, 0.85),
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
