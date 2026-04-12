import create from 'zustand';
import type { TutorialStep } from '@/components/tutorial-flyover/types';

interface TutorialState {
  isActive: boolean;
  pendingFlyover: boolean; // set by tutorial page, consumed by home page
  currentStepIndex: number;
  steps: TutorialStep[];

  requestFlyover: () => void;
  startFlyover: (steps: TutorialStep[]) => void;
  consumePending: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  isActive: false,
  pendingFlyover: false,
  currentStepIndex: 0,
  steps: [],

  requestFlyover: () => set({ pendingFlyover: true }),

  consumePending: () => set({ pendingFlyover: false }),

  startFlyover: (steps) =>
    set({
      isActive: true,
      pendingFlyover: false,
      currentStepIndex: 0,
      steps,
    }),

  next: () => {
    const { currentStepIndex, steps } = get();
    if (currentStepIndex < steps.length - 1) {
      set({ currentStepIndex: currentStepIndex + 1 });
    } else {
      set({ isActive: false, currentStepIndex: 0, steps: [] });
    }
  },

  back: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex > 0) {
      set({ currentStepIndex: currentStepIndex - 1 });
    }
  },

  skip: () =>
    set({
      isActive: false,
      pendingFlyover: false,
      currentStepIndex: 0,
      steps: [],
    }),
}));
