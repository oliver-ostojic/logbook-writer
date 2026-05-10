'use client';

import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface TutorialNavigationProps {
  currentSlide: number;
  totalSlides: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onGoToSlide: (index: number) => void;
  isLoading?: boolean;
}

export default function TutorialNavigation({
  currentSlide,
  totalSlides,
  onNext,
  onBack,
  onSkip,
  onContinue,
  onGoToSlide,
  isLoading,
}: TutorialNavigationProps) {
  const isLastSlide = currentSlide === totalSlides - 1;
  const isFirstSlide = currentSlide === 0;

  return (
    <div
      className="ai-glass-border"
      style={{ ...aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.1), width: '100%' }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          ...aiGlassLightContentStyle('9999px', 0.85),
          padding: '10px 8px',
          gap: 12,
        }}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          disabled={isFirstSlide}
          style={{
            padding: '8px 20px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            fontWeight: 600,
            color: '#6B6B6B',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '9999px',
            cursor: isFirstSlide ? 'default' : 'pointer',
            opacity: isFirstSlide ? 0 : 1,
            transition: 'opacity 0.2s ease',
            appearance: 'none',
            WebkitAppearance: 'none',
            outline: 'none',
          }}
        >
          Back
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <div
              key={i}
              onClick={() => onGoToSlide(i)}
              style={{
                width: i === currentSlide ? 24 : 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor: i === currentSlide ? '#2C2C2C' : '#D4D4D4',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* Next / Continue button */}
        <button
          onClick={isLastSlide ? onContinue : onNext}
          disabled={isLoading}
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
            transition: 'background-color 0.2s ease',
            appearance: 'none',
            WebkitAppearance: 'none',
            outline: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 55%)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 60%)'; }}
        >
          {isLoading ? 'Loading...' : isLastSlide ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  );
}
