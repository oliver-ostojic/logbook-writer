'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { NavStatsCard } from '@/app/stores/[storeId]/home/components';
import { login } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/authStore';
import { useTutorialStore } from '@/lib/tutorialStore';
import TutorialNavigation from './components/TutorialNavigation';
import TutorialSlideIntro from './components/TutorialSlideIntro';
import TutorialSlideProblem from './components/TutorialSlideProblem';
import TutorialSlideSolution from './components/TutorialSlideSolution';
import TutorialSlideRoles from './components/TutorialSlideRoles';
import TutorialSlideSolver from './components/TutorialSlideSolver';
import TutorialSlideRealWorld from './components/TutorialSlideRealWorld';

const SLIDES = [
  TutorialSlideIntro,
  TutorialSlideProblem,
  TutorialSlideSolution,
  TutorialSlideRoles,
  TutorialSlideSolver,
  TutorialSlideRealWorld,
];

export default function TutorialPage() {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const { setUser, setToken } = useAuthStore();
  const { requestFlyover } = useTutorialStore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleDemoLogin = async () => {
    setIsLoggingIn(true);
    try {
      const response = await login({ username: 'demo', password: 'demo123' });
      setUser(response.user);
      if (response.token) {
        setToken(response.token);
      }
      requestFlyover();
      router.push(`/stores/${response.user.storeId}/home`);
    } catch {
      router.push('/login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSkip = () => {
    router.push('/login');
  };

  const CurrentSlide = SLIDES[currentSlide];

  return (
    <main
      className="min-h-screen relative"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: '24px 0' }}>
        <div
          className="ai-glass-border rounded-[1.5rem]"
          style={{ ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08), width: '875px' }}
        >
          <div
            className="rounded-[1.5rem]"
            style={{
              ...aiGlassLightContentStyle('1.5rem', 0.6),
              padding: '24px',
            }}
          >
            <div className="flex flex-col gap-6">
              {/* Tab header: Tutorial | Skip to sign in */}
              <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                <div
                  className="ai-glass-border"
                  style={aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)}
                >
                  <div
                    style={{
                      ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                      padding: '8px',
                    }}
                  >
                    <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                      <NavStatsCard
                        label="Tutorial"
                        textOnly
                        isActive={true}
                        onClick={() => {}}
                      />
                      <NavStatsCard
                        label="Skip to sign in"
                        textOnly
                        isActive={false}
                        onClick={handleSkip}
                      />
                      <NavStatsCard
                        label="Exit"
                        textOnly
                        isActive={false}
                        onClick={() => window.parent.postMessage({ type: 'CLOSE_LOGBOOK_OVERLAY' }, '*')}
                      />
                    </nav>
                  </div>
                </div>
              </div>

              {/* Slide content card */}
              <div
                className="ai-glass-border rounded-[1.5rem]"
                style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
              >
                <div
                  className="rounded-[1.5rem]"
                  style={{
                    ...aiGlassLightContentStyle('1.5rem', 0.6),
                    padding: '32px',
                    minHeight: '340px',
                  }}
                >
                  <CurrentSlide />
                </div>
              </div>

              {/* Navigation — wrapped in its own glass pill to isolate compositing */}
              <TutorialNavigation
                currentSlide={currentSlide}
                totalSlides={SLIDES.length}
                onNext={handleNext}
                onBack={handleBack}
                onSkip={handleSkip}
                onContinue={handleDemoLogin}
                onGoToSlide={setCurrentSlide}
                isLoading={isLoggingIn}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
