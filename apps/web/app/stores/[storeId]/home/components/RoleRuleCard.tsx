'use client';

import { useState } from 'react';
import { CardSmall, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

export function RoleRuleCard({
  rule,
  itemType,
  isSelected,
  onView,
  onEdit,
  onDelete,
}: {
  rule: any;
  itemType: string;
  isSelected: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <CardSmall
      lightMode={true}
      borderOpacity={0}
      style={{
        ...(isSelected && {
          filter: 'brightness(0.95)',
          transform: 'scale(1.02)',
        }),
        borderRadius: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      }}
      contentStyle={{
        background: 'rgb(255, 255, 255)',
        backdropFilter: 'none',
        padding: '12px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'visible',
      }}
      onClick={onView}
    >
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ position: 'relative' }}
      >
        <div className="flex items-center justify-center h-full">
          {rule.TargetRole ? (
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#2C2C2C',
                  lineHeight: 1.2,
                  textAlign: 'center',
                }}
              >
                {rule.Role?.displayName || 'Unknown'}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: '#6B6B6B',
                }}
              >
                vs.
              </span>
              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                <div
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.5),
                    background: 'rgba(245, 245, 245, 0.7)',
                    padding: '4px 12px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                  }}
                >
                  {rule.TargetRole?.displayName || 'Unknown'}
                </div>
              </div>
            </div>
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 500,
                color: '#2C2C2C',
                lineHeight: 1.2,
                textAlign: 'center',
              }}
            >
              {rule.Role?.displayName || 'Unknown'}
            </span>
          )}
        </div>

        {isHovered && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              style={{
                position: 'absolute',
                left: '0',
                top: '50%',
                transform: 'translateY(-50%)',
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
                zIndex: 10,
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
                position: 'absolute',
                right: '0',
                top: '50%',
                transform: 'translateY(-50%)',
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
                zIndex: 10,
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </CardSmall>
  );
}
