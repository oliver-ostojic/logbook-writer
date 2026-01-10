import React from 'react';
import { aiGlassBorderStyle, aiGlassContentStyle } from './styles';

// Wrapper component for easy reuse
export interface AiGlassCardProps {
  children: React.ReactNode;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
}

export const AiGlassCard: React.FC<AiGlassCardProps> = ({
  children,
  borderRadius = '1rem',
  className = '',
  style = {},
  contentStyle = {},
}) => (
  <div className="ai-glass-border" style={{ ...aiGlassBorderStyle(borderRadius), ...style }} data-radius={typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius}>
    <div
      className={className}
      style={{ ...aiGlassContentStyle(borderRadius), ...contentStyle }}
    >
      {children}
    </div>
  </div>
);
