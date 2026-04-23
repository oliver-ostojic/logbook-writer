'use client';

import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface TutorialBottomBarProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  onExit: () => void;
  hideNext?: boolean;
}

export default function TutorialBottomBar({
  currentStep,
  totalSteps,
  onNext,
  onSkip,
  onExit,
  hideNext,
}: TutorialBottomBarProps) {
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10001,
        minWidth: 400,
      }}
    >
      <div
        className="ai-glass-border"
        style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.1)}
      >
        <div
          className="flex items-center justify-between"
          style={{
            ...aiGlassLightContentStyle('9999px', 0.85),
            padding: '10px 8px',
            gap: 12,
          }}
        >
          {/* Exit button */}
          <button
            onClick={onExit}
            style={{
              padding: '8px 20px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 600,
              color: 'white',
              backgroundColor: '#2C2C2C',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#000000';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2C2C2C';
            }}
          >
            Exit
          </button>

          {/* Dot indicators */}
          <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === currentStep ? 24 : 8,
                  height: 8,
                  borderRadius: 9999,
                  backgroundColor: i === currentStep ? '#2C2C2C' : '#D4D4D4',
                  transition: 'all 0.3s ease',
                  border: 'none',
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Next / Finish button */}
          <button
            onClick={isLastStep ? onSkip : onNext}
            style={{
              padding: '8px 20px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 600,
              color: 'white',
              backgroundColor: 'hsl(0, 84%, 60%)',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease, opacity 0.2s ease',
              visibility: hideNext ? 'hidden' : 'visible',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 55%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 60%)';
            }}
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
