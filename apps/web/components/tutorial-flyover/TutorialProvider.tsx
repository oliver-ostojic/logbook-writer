'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTutorialStore } from '@/lib/tutorialStore';
import TutorialOverlay from './TutorialOverlay';
import TutorialInfoBubble from './TutorialInfoBubble';
import TutorialBottomBar from './TutorialBottomBar';
import type { TargetRect } from './types';

const SCROLL_SETTLE_MS = 250;
const ELEMENT_START_TOP_MARGIN = 240; // Room above element for bubble + padding

/**
 * Orchestrates the tutorial flyover system.
 * Rendered once at the root layout level. Reads tutorial state from Zustand,
 * finds target elements via data-tutorial-id, handles scrolling, measures
 * bounding rects, and elevates target z-index for click-through.
 */
export default function TutorialProvider() {
  const { isActive, currentStepIndex, steps, next, skip } =
    useTutorialStore();
  const router = useRouter();

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [measuredStepIndex, setMeasuredStepIndex] = useState(-1);
  const prevTargetRef = useRef<HTMLElement | null>(null);

  const currentStep = isActive && steps.length > 0 ? steps[currentStepIndex] : null;
  const bubbleReady = measuredStepIndex === currentStepIndex;

  // Measure an element and store document-relative coordinates,
  // clamped horizontally to ancestor scroll containers + viewport
  const measureTarget = useCallback(
    (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const dx = currentStep?.offset?.x ?? 0;
      const dy = currentStep?.offset?.y ?? 0;

      // Walk up the DOM to find scroll containers and clamp to their visible area
      let clipLeft = rect.left;
      let clipRight = rect.right;
      let ancestor = el.parentElement;
      while (ancestor) {
        const { overflowX } = getComputedStyle(ancestor);
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') {
          const parentRect = ancestor.getBoundingClientRect();
          clipLeft = Math.max(clipLeft, parentRect.left);
          clipRight = Math.min(clipRight, parentRect.right);
        }
        ancestor = ancestor.parentElement;
      }
      // Also clamp to viewport edges
      clipLeft = Math.max(clipLeft, 0);
      clipRight = Math.min(clipRight, window.innerWidth);

      setTargetRect({
        top: rect.top + window.scrollY + dy,
        left: clipLeft + window.scrollX + dx,
        width: Math.max(0, clipRight - clipLeft),
        height: rect.height,
        bottom: rect.bottom + window.scrollY + dy,
        right: clipRight + window.scrollX + dx,
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
    let customEventCleanup: (() => void) | null = null;

    // Hide bubble until new measurement is ready
    setMeasuredStepIndex(-1);

    // Clear previous target ref
    prevTargetRef.current = null;

    // Navigate to the step's page if we're on a different route
    if (currentStep.route) {
      const [routePath] = currentStep.route.split('?');
      if (window.location.pathname !== routePath) {
        router.push(currentStep.route);
      }
    }

    // Run step entry action (e.g. set viewHint in store)
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

      // Attach interaction listener for advanceOnInteraction steps
      if (currentStep.advanceOnInteraction) {
        const eventType = currentStep.advanceOnInteraction === 'dblclick' ? 'dblclick' : 'click';
        const handleEvent = () => next();
        el.addEventListener(eventType, handleEvent);
        clickCleanup = () => el.removeEventListener(eventType, handleEvent);
      }

      // Listen for custom 'tutorial-advance' window event
      if (currentStep.advanceOnCustomEvent) {
        const handleCustomEvent = () => next();
        window.addEventListener('tutorial-advance', handleCustomEvent);
        customEventCleanup = () => window.removeEventListener('tutorial-advance', handleCustomEvent);
      }

      // Handle scroll — keep old spotlight visible, then animate to new position
      if (currentStep.scroll === 'element') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => commitMeasurement(el), SCROLL_SETTLE_MS);
      } else if (currentStep.scroll === 'element-start') {
        const elTop = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, elTop - ELEMENT_START_TOP_MARGIN), behavior: 'smooth' });
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
      customEventCleanup?.();
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
      <TutorialOverlay targetRect={targetRect} blockClicks={!currentStep.advanceOnInteraction && !currentStep.interactive && !currentStep.advanceOnCustomEvent} noDim={currentStep.noDim} spotlightPadding={currentStep.spotlightPadding} />

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
        onSkip={skip}
        onExit={() => {
          skip();
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'CLOSE_LOGBOOK_OVERLAY' }, '*');
          }
        }}
        hideNext={!!currentStep.advanceOnInteraction || !!currentStep.advanceOnCustomEvent}
      />
    </>,
    document.body,
  );
}
