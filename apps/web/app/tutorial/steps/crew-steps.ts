import type { TutorialStep } from '@/components/tutorial-flyover/types';

interface CrewStepCallbacks {
  storeId: string;
  crewId: string;
  setViewHint: (view: string | null) => void;
}

export function createCrewSteps(callbacks: CrewStepCallbacks): TutorialStep[] {
  const crewRoute = `/stores/${callbacks.storeId}/crew/${callbacks.crewId}`;

  return [
    {
      id: 'crew-prefs-welcome',
      route: crewRoute,
      onEnter: () => callbacks.setViewHint('preferences'),
      bubble: {
        title: 'Crew Preferences',
        body: 'Welcome to the crew member UI! Each crew member can configure their own role preferences freely — they can create as many as they like, although some preferences are granted by management.',
        position: 'center',
      },
    },
    {
      id: 'crew-prefs-distribution-consecutive',
      target: 'crew-prefs-distribution-consecutive',
      route: crewRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('preferences'),
      interactive: true,
      bubble: {
        title: 'Role Distribution & Continuous Time',
        body: 'These two preferences use a drag-bubble mechanism. Role Distribution controls how much of a crew member\'s shift is spent on two specific roles. For example, for this crew member, they prefer to work more product than register. Continuous Time on Role sets a preferred minimum and maximum duration for consecutive blocks of the same role.',
        position: 'left',
      },
    },
    {
      id: 'crew-prefs-hour-timing',
      target: 'crew-prefs-hour-timing',
      route: crewRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('preferences'),
      interactive: true,
      bubble: {
        title: 'By Hour & Timing Preferences',
        body: 'These preferences use drag bars to set time-based role preferences. By Hour lets crew pick which roles they prefer or dislike during specific hours. Timing lets them indicate whether they prefer a role early, in the middle, or later in their shift.',
        position: 'left',
      },
    },
    {
      id: 'crew-prefs-cannot-be-assigned-after',
      target: 'crew-prefs-cannot-be-assigned-after',
      route: crewRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('preferences'),
      interactive: true,
      bubble: {
        title: 'Cannot Be Assigned After',
        body: 'This rule-based preference prevents a role from being scheduled after another specific role. For example, a crew member can specify that they should not be assigned to Register after doing Product stocking.',
        position: 'left',
      },
    },
  ];
}
