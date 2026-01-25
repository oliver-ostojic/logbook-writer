'use client';

import React from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

/**
 * TitleBubble
 *
 * A lightweight "pill"/"bubble" title used for section labels.
 * Intended to mirror the home page's small rounded titles (e.g., Activity Log).
 */
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
    <div
      className={`inline-flex items-center ai-glass-border ${className}`}
      style={{
        ...aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08),
        ...style,
      }}
    >
      <div
        style={{
          ...aiGlassLightContentStyle('9999px', 0.6),
          padding: '6px 12px',
        }}
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
      </div>
    </div>
  );
}
