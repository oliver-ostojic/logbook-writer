'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTutorialStore } from '@/lib/tutorialStore';
import TutorialOverlay from './TutorialOverlay';
import TutorialInfoBubble from './TutorialInfoBubble';
import TutorialBottomBar from './TutorialBottomBar';
import type { TargetRect } from './types';

const SCROLL_SETTLE_MS = 250;

/**
 * Orchestrates the tutorial flyover system.
 * Rendered once at the root layout level. Reads tutorial state from Zustand,
 * finds target elements via data-tutorial-id, handles scrolling, measures
 * bounding rects, and elevates target z-index for click-through.
 */
export default function TutorialProvider() {
  const { isActive, currentStepIndex, steps, next, back, skip } =
    useTutorialStore();

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [measuredStepIndex, setMeasuredStepIndex] = useState(-1);
  const prevTargetRef = useRef<HTMLElement | null>(null);

  const currentStep = isActive && steps.length > 0 ? steps[currentStepIndex] : null;
  const bubbleReady = measuredStepIndex === currentStepIndex;

  // Measure an element and store document-relative coordinates
  const measureTarget = useCallback(
    (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const dx = currentStep?.offset?.x ?? 0;
      const dy = currentStep?.offset?.y ?? 0;
      setTargetRect({
        top: rect.top + window.scrollY + dy,
        left: rect.left + window.scrollX + dx,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom + window.scrollY + dy,
        right: rect.right + window.scrollX + dx,
      });
    },
    [currentStep],
  );

  // Find target element, scroll if needed, then measure
  useEffect(() => {
    if (!currentStep) {
      setTargetRect(null);
      return;
    }

    let cancelled = false;
    let rafId: number;
    let stabilizeTimer: ReturnType<typeof setTimeout>;
    let clickCleanup: (() => void) | null = null;

    // Hide bubble until new measurement is ready
    setMeasuredStepIndex(-1);

    // Clear previous target ref
    prevTargetRef.current = null;

    // Run step entry action (e.g. switch view, select item)
    currentStep.onEnter?.();

    // No target — overlay-only step (e.g. welcome screen)
    if (!currentStep.target) {
      setTargetRect(null);
      setMeasuredStepIndex(currentStepIndex);
      return () => { cancelled = true; };
    }

    // Measure and show bubble, then re-measure after CSS transitions settle
    const commitMeasurement = (el: HTMLElement) => {
      if (cancelled) return;
      measureTarget(el);
      setMeasuredStepIndex(currentStepIndex);

      // Re-measure after CSS transitions finish (e.g. 300ms width transitions)
      stabilizeTimer = setTimeout(() => {
        if (!cancelled && prevTargetRef.current) {
          measureTarget(prevTargetRef.current);
        }
      }, 150);
    };

    // Poll for the target element (it may not be rendered yet after navigation)
    const findAndSetup = () => {
      if (cancelled) return;

      const el = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${currentStep.target}"]`,
      );

      if (!el) {
        rafId = requestAnimationFrame(findAndSetup);
        return;
      }

      prevTargetRef.current = el;

      // Attach click listener for advanceOnInteraction steps
      if (currentStep.advanceOnInteraction) {
        const handleClick = () => next();
        el.addEventListener('click', handleClick);
        clickCleanup = () => el.removeEventListener('click', handleClick);
      }

      // Handle scroll — keep old spotlight visible, then animate to new position
      if (currentStep.scroll === 'element') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => commitMeasurement(el), SCROLL_SETTLE_MS);
      } else if (typeof currentStep.scroll === 'number') {
        window.scrollTo({ top: currentStep.scroll, behavior: 'smooth' });
        setTimeout(() => commitMeasurement(el), SCROLL_SETTLE_MS);
      } else {
        // No scroll needed — measure immediately
        commitMeasurement(el);
      }
    };

    findAndSetup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(stabilizeTimer);
      clickCleanup?.();
    };
  }, [currentStep, measureTarget, next]);

  // Re-measure on window resize only (spotlight scrolls naturally via absolute positioning)
  useEffect(() => {
    if (!currentStep || !prevTargetRef.current) return;

    let ticking = false;

    const handleResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (prevTargetRef.current) {
          measureTarget(prevTargetRef.current);
        }
        ticking = false;
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [currentStep, measureTarget]);

  if (!isActive || !currentStep) return null;

  return createPortal(
    <>
      <TutorialOverlay targetRect={targetRect} blockClicks={!currentStep.advanceOnInteraction} noDim={currentStep.noDim} />

      {(targetRect || currentStep.bubble.position === 'center') && bubbleReady && (
        <TutorialInfoBubble
          title={currentStep.bubble.title}
          body={currentStep.bubble.body}
          position={currentStep.bubble.position}
          targetRect={targetRect}
        />
      )}

      <TutorialBottomBar
        currentStep={currentStepIndex}
        totalSteps={steps.length}
        onNext={next}
        onBack={back}
        onSkip={skip}
        hideNext={currentStep.advanceOnInteraction}
      />
    </>,
    document.body,
  );
}
