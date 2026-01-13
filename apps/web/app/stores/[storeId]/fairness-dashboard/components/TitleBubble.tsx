'use client';

import React from 'react';

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
        borderRadius: 9999,
        ...style,
      }}
    >
      <div
        style={{
          borderRadius: 9999,
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            fontWeight: 500,
            color: '#DBDADB',
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
