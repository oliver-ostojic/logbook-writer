'use client';

import { CardContainer, GlassPillCard, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

// Role pill component matching the assigned roles style in CrewDetailView
function RolePill({ name }: { name: string }) {
  return (
    <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
      <div
        style={{
          ...aiGlassLightContentStyle('9999px', 0.5),
          padding: '4px 12px',
          fontFamily: 'var(--font-open-sans)',
          fontSize: '12px',
          fontWeight: 500,
          color: '#2C2C2C',
        }}
      >
        {name}
      </div>
    </div>
  );
}

export function TimingPreferenceCard() {
  return (
    <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
      <div className="flex flex-col gap-3">
        {/* Title bubble and Add button row */}
        <div className="flex items-center justify-between">
          <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
            <div
              style={{
                ...aiGlassLightContentStyle('9999px', 0.6),
                padding: '6px 14px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 500,
                color: '#2C2C2C',
              }}
            >
              Timing
            </div>
          </div>
          {/* Add button */}
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
            <button
              onClick={() => {
                // TODO: Add timing preference
              }}
              style={{
                ...aiGlassLightContentStyle('9999px', 0.4),
                padding: '6px 14px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 500,
                color: '#6B6B6B',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ color: 'hsl(0, 84%, 60%)', fontSize: '16px', lineHeight: 1 }}>+</span>
              Add
            </button>
          </div>
        </div>

        {/* Three columns with title bubbles and role pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {/* Early column */}
          <div className="flex flex-col gap-2">
            {/* Title bubble */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
              <div
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.6),
                  padding: '4px 10px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#2C2C2C',
                }}
              >
                Early
              </div>
            </div>
            {/* Role pills */}
            <div className="flex flex-col gap-1">
              <RolePill name="Register" />
            </div>
          </div>

          {/* Middle column */}
          <div className="flex flex-col gap-2">
            {/* Title bubble */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
              <div
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.6),
                  padding: '4px 10px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#2C2C2C',
                }}
              >
                Middle
              </div>
            </div>
            {/* No roles placeholder */}
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '11px',
                color: '#9A999E',
              }}
            >
              No roles
            </span>
          </div>

          {/* Late column */}
          <div className="flex flex-col gap-2">
            {/* Title bubble */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
              <div
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.6),
                  padding: '4px 10px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#2C2C2C',
                }}
              >
                Late
              </div>
            </div>
            {/* Role pills */}
            <div className="flex flex-col gap-1">
              <RolePill name="Demo" />
              <RolePill name="Product" />
            </div>
          </div>
        </div>
      </div>
    </CardContainer>
  );
}
