export type BubblePosition = 'above' | 'below' | 'left' | 'right' | 'center';

export interface TutorialStep {
  id: string;
  target?: string; // matches data-tutorial-id attribute on DOM element (omit for overlay-only steps)
  scroll?: 'element' | number; // 'element' scrolls target into view, number scrolls to fixed Y
  offset?: { x?: number; y?: number }; // pixel nudge applied to the measured target rect
  onEnter?: () => void; // runs when this step becomes active (e.g. switch view, select item)
  advanceOnInteraction?: boolean; // auto-advance to next step when user clicks inside the target
  noDim?: boolean; // skip the dim overlay (show bubble over unhighlighted page)
  bubble: {
    title: string;
    body: string;
    position: BubblePosition;
  };
}

export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}
