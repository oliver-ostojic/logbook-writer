'use client';

import type { TargetRect } from './types';

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 16;

interface TutorialOverlayProps {
  targetRect: TargetRect | null;
  blockClicks?: boolean;
  noDim?: boolean;
  spotlightPadding?: number;
}

/**
 * Dim overlay with a rounded spotlight cutout, positioned in document coordinates.
 *
 * The spotlight uses position: absolute so it scrolls with the page naturally —
 * no scroll-listener recalculation needed. The click-blocking layer uses
 * position: fixed to cover the viewport.
 */
export default function TutorialOverlay({ targetRect, blockClicks, noDim, spotlightPadding }: TutorialOverlayProps) {
  // No spotlight target
  if (!targetRect) {
    return (
      <>
        {!noDim && <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)', zIndex: 9998, pointerEvents: 'none' }} />}
        {blockClicks && <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} />}
      </>
    );
  }

  const pad = spotlightPadding ?? SPOTLIGHT_PADDING;
  const spotlightTop = targetRect.top - pad;
  const spotlightLeft = targetRect.left - pad;
  const spotlightWidth = targetRect.width + pad * 2;
  const spotlightHeight = targetRect.height + pad * 2;

  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 9999,
    transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease',
  };

  return (
    <>
      {/* Visual spotlight — absolute so it scrolls with the page */}
      <div
        style={{
          position: 'absolute',
          top: spotlightTop,
          left: spotlightLeft,
          width: spotlightWidth,
          height: spotlightHeight,
          borderRadius: SPOTLIGHT_RADIUS,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
          zIndex: 9998,
          pointerEvents: 'none',
          transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease',
        }}
      />

      {/* Click-blocking layer(s) */}
      {blockClicks ? (
        /* Full-screen blocker for purely informational steps */
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} />
      ) : (
        /* Four frame divs around the spotlight — clicks only pass through the cutout */
        <>
          <div style={{ ...frameStyle, top: 0, left: 0, right: 0, height: Math.max(0, spotlightTop) }} />
          <div style={{ ...frameStyle, top: spotlightTop + spotlightHeight, left: 0, right: 0, bottom: 0 }} />
          <div style={{ ...frameStyle, top: spotlightTop, left: 0, width: Math.max(0, spotlightLeft), height: spotlightHeight }} />
          <div style={{ ...frameStyle, top: spotlightTop, left: spotlightLeft + spotlightWidth, right: 0, height: spotlightHeight }} />
        </>
      )}
    </>
  );
}
