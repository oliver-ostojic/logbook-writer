'use client';

import { CardContainer, GlassPillCard, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

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

        {/* Three glass pill cards with title bubbles inside */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          <GlassPillCard borderRadius="1rem" padding="12px">
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
                Early
              </div>
            </div>
          </GlassPillCard>

          <GlassPillCard borderRadius="1rem" padding="12px">
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
                Middle
              </div>
            </div>
          </GlassPillCard>

          <GlassPillCard borderRadius="1rem" padding="12px">
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
                Late
              </div>
            </div>
          </GlassPillCard>
        </div>
      </div>
    </CardContainer>
  );
}
