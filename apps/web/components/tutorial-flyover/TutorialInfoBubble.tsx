'use client';

import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import type { BubblePosition, TargetRect } from './types';

const BUBBLE_GAP = 16;
const BUBBLE_MAX_WIDTH = 320;

interface TutorialInfoBubbleProps {
  title: string;
  body: string;
  position: BubblePosition;
  targetRect: TargetRect | null;
}

function computeBubbleStyle(
  position: BubblePosition,
  rect: TargetRect | null,
): React.CSSProperties {
  // Center is viewport-relative (fixed), everything else is document-relative (absolute)
  if (position === 'center') {
    return {
      position: 'fixed',
      zIndex: 10001,
      maxWidth: BUBBLE_MAX_WIDTH,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const base: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10001,
    maxWidth: BUBBLE_MAX_WIDTH,
  };

  if (!rect) return base;

  switch (position) {
    case 'above':
      return {
        ...base,
        top: rect.top - BUBBLE_GAP,
        left: rect.left + rect.width / 2,
        transform: 'translate(-50%, -100%)',
      };
    case 'below':
      return {
        ...base,
        top: rect.bottom + BUBBLE_GAP,
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)',
      };
    case 'left':
      return {
        ...base,
        top: rect.top + rect.height / 2,
        left: rect.left - BUBBLE_GAP,
        transform: 'translate(-100%, -50%)',
      };
    case 'right':
      return {
        ...base,
        top: rect.top + rect.height / 2,
        left: rect.right + BUBBLE_GAP,
        transform: 'translateY(-50%)',
      };
  }
}

export default function TutorialInfoBubble({
  title,
  body,
  position,
  targetRect,
}: TutorialInfoBubbleProps) {
  if (!targetRect && position !== 'center') return null;

  const style = computeBubbleStyle(position, targetRect);

  return (
    <div style={style}>
      <div
        className="ai-glass-border"
        style={aiGlassLightBorderStyle('1rem', '0, 0, 0', 0.1)}
      >
        <div
          style={{
            ...aiGlassLightContentStyle('1rem', 0.85),
            padding: '20px 24px',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '15px',
              fontWeight: 700,
              color: '#2C2C2C',
              margin: 0,
              marginBottom: 8,
            }}
          >
            {title}
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 400,
              color: '#6B6B6B',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
