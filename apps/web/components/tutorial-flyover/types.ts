export type BubblePosition = 'above' | 'below' | 'left' | 'right' | 'center';

export interface TutorialStep {
  id: string;
  target?: string; // matches data-tutorial-id attribute on DOM element (omit for overlay-only steps)
  scroll?: 'element' | 'element-start' | number; // 'element' scrolls to center, 'element-start' to top, number scrolls to fixed Y
  offset?: { x?: number; y?: number }; // pixel nudge applied to the measured target rect
  onEnter?: () => void; // runs when this step becomes active (e.g. switch view, select item)
  advanceOnInteraction?: boolean | 'dblclick'; // auto-advance on click (true) or double-click ('dblclick')
  advanceOnCustomEvent?: boolean; // advance when a 'tutorial-advance' CustomEvent fires on window
  interactive?: boolean; // allow clicks inside the target without auto-advancing (shows Next button)
  spotlightPadding?: number; // override default 8px spotlight padding for this step
  noDim?: boolean; // skip the dim overlay (show bubble over unhighlighted page)
  route?: string; // absolute path to navigate to when this step activates (TutorialProvider handles)
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
