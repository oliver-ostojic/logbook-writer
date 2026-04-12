'use client';

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
    <div className="flex flex-col items-center">
      {/* Navigation bar */}
      <div className="flex items-center justify-between w-full">
        {/* Back button */}
        <button
          onClick={onBack}
          disabled={isFirstSlide}
          style={{
            padding: '10px 20px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            fontWeight: 600,
            color: isFirstSlide ? '#9A999E' : '#6B6B6B',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '9999px',
            cursor: isFirstSlide ? 'default' : 'pointer',
            transition: 'color 0.2s ease',
            opacity: isFirstSlide ? 0 : 1,
          }}
        >
          Back
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              onClick={() => onGoToSlide(i)}
              style={{
                width: i === currentSlide ? '24px' : '8px',
                height: '8px',
                borderRadius: '9999px',
                backgroundColor: i === currentSlide ? '#2C2C2C' : '#D4D4D4',
                transition: 'all 0.3s ease',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* Next / Get Started button */}
        <button
          onClick={isLastSlide ? onContinue : onNext}
          disabled={isLoading}
          style={{
            padding: '10px 20px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'white',
            backgroundColor: 'hsl(0, 84%, 60%)',
            border: 'none',
            borderRadius: '9999px',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 55%)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 60%)')}
        >
          {isLoading ? 'Loading...' : isLastSlide ? 'Continue' : 'Next'}
        </button>
      </div>

    </div>
  );
}
