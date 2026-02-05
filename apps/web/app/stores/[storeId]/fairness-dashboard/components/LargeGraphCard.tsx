'use client';

import React from 'react';
import { CardSmall, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

export interface LargeGraphCardProps {
  title: string;
  legend?: React.ReactNode;
  stats?: { label: string; value: string | number; unit?: string }[];
  children: React.ReactNode;
  className?: string;
}

export function LargeGraphCard({
  title,
  legend,
  stats,
  children,
  className = ''
}: LargeGraphCardProps) {
  return (
    <CardSmall
      lightMode={true}
      borderRadius="1.5rem"
      style={{ height: 'auto' }}
      contentStyle={{ padding: 0, position: 'relative' }}
      className={className}
    >
      {/* Header layer with darker background */}
      <div
        className="ai-glass-border"
        style={{
          ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)
        }}
      >
        <div
          style={{
            ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.4),
            padding: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* Title bubble */}
          <div
            className="ai-glass-border"
            style={{
              ...aiGlassLightBorderStyle('9999px'),
              width: 'fit-content'
            }}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('9999px', 0.5),
                padding: '8px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '12px',
                fontWeight: 600,
                color: '#2C2C2C',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </div>
          </div>

          {/* Legend or Stats */}
          {legend}
          {stats && stats.length > 0 && (
            <div className="flex gap-4">
              {stats.map((stat, index) => (
                <div key={index} className="flex items-baseline gap-1">
                  <span
                    className="text-[12px]"
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      color: '#7C7F82',
                      fontWeight: 350
                    }}
                  >
                    {stat.label}:
                  </span>
                  <span
                    className="text-[14px]"
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      color: '#DBDADB',
                      fontWeight: 500
                    }}
                  >
                    {stat.value}
                  </span>
                  {stat.unit && (
                    <span
                      className="text-[12px]"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#7C7F82',
                        fontWeight: 350
                      }}
                    >
                      {stat.unit}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Graph content area */}
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </CardSmall>
  );
}
