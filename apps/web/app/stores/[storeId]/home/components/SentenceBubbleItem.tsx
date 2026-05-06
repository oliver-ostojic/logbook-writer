'use client';

import { useState } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

export function SentenceBubbleItem({
  parts,
  paddingLeft,
  paddingRight,
  isSelected,
  onView,
  onEdit,
  onDelete,
}: {
  parts: any;
  paddingLeft: string;
  paddingRight: string;
  isSelected: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (!parts) return null;

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{
          display: 'inline-block',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          background: 'rgb(255, 255, 255)',
          filter: (isSelected || isHovered) ? 'brightness(0.95)' : undefined,
          transform: (isSelected || isHovered) ? 'scale(1.02)' : undefined,
          borderRadius: '9999px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        }}
        onClick={onView}
      >
        <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: `10px ${paddingRight} 10px ${paddingLeft}` }}>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              color: '#2C2C2C',
            }}
          >
            {parts.map((part: any, idx: number) => {
              if (part.type === 'bubble') {
                return (
                  <div key={idx} className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                    <div
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.5),
                        background: 'rgba(245, 245, 245, 0.7)',
                        padding: '4px 12px',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#2C2C2C',
                      }}
                    >
                      {part.content}
                    </div>
                  </div>
                );
              }
              return <span key={idx}>{part.content}</span>;
            })}
          </div>
        </div>
      </div>

      {isHovered && (
        <div
          style={{
            position: 'absolute',
            right: '-8px',
            top: '50%',
            transform: 'translateY(-50%) translateX(100%)',
            display: 'flex',
            gap: '4px',
            zIndex: 10,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              border: 'none',
              borderRadius: '9999px',
              padding: '4px 10px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '11px',
              fontWeight: 500,
              color: '#FFFFFF',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              backgroundColor: 'hsla(0, 84%, 60%, 0.85)',
              border: 'none',
              borderRadius: '9999px',
              padding: '4px 10px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '11px',
              fontWeight: 500,
              color: '#FFFFFF',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
