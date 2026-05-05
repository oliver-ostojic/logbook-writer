'use client';

import React from 'react';
import { GlassPillCard } from '@/components/ui/ai-glass';

export function TitleBubble({
  title,
  className = '',
  style = {},
}: {
  title: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <GlassPillCard
      borderRadius="9999px"
      backgroundOpacity={0.6}
      padding="6px 12px"
      className={`inline-flex items-center ${className}`}
      style={style}
    >
      <span
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '14px',
          fontWeight: 500,
          color: '#2C2C2C',
          lineHeight: 1,
          letterSpacing: '0.2px',
          userSelect: 'none',
        }}
      >
        {title}
      </span>
    </GlassPillCard>
  );
}
