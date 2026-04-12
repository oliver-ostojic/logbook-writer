import type { TutorialStep } from '@/components/tutorial-flyover/types';

interface HomeStepCallbacks {
  setActiveView: (view: 'home' | 'crew' | 'roles' | 'logbooks' | 'preferences') => void;
  clearSelection: () => void;
}

export function createHomeSteps(callbacks: HomeStepCallbacks): TutorialStep[] {
  return [
    {
      id: 'welcome',
      bubble: {
        title: 'Welcome!',
        body: 'Welcome to the Logbook Writer manager interface. This guided tour will walk you through the key features. Hit Next to get started.',
        position: 'center',
      },
    },
    {
      id: 'top-nav',
      target: 'top-nav',
      onEnter: () => callbacks.setActiveView('home'),
      bubble: {
        title: 'Top Navigation',
        body: 'Navigate between the Home dashboard, Fairness Dashboard, and Settings from here.',
        position: 'below',
      },
    },
    {
      id: 'view-tabs',
      target: 'view-tabs',
      onEnter: () => callbacks.setActiveView('home'),
      bubble: {
        title: 'View Tabs',
        body: 'Switch between Activity, Crew, Logbooks, Roles, and Preferences. Each tab shows a different list view and CRUD interfaces.',
        position: 'below',
      },
    },
    {
      id: 'activity-feed',
      target: 'activity-feed',
      scroll: 'element',
      onEnter: () => callbacks.setActiveView('home'),
      bubble: {
        title: 'Activity Feed',
        body: 'See and filter recent activity for this store — solver runs, logbook generations, edits, and comments from your team.',
        position: 'above',
      },
    },
    {
      id: 'crew-header',
      target: 'crew-header',
      scroll: 0,
      onEnter: () => callbacks.setActiveView('crew'),
      bubble: {
        title: 'List Header',
        body: 'Search, paginate, and add new crew members from this bar.',
        position: 'below',
      },
    },
    {
      id: 'crew-list',
      target: 'crew-list',
      scroll: 'element',
      advanceOnInteraction: true,
      onEnter: () => callbacks.clearSelection(),
      bubble: {
        title: 'Crew List',
        body: 'All crew members for this store. Click a name to view their details.',
        position: 'right',
      },
    },
    {
      id: 'detail-header',
      target: 'detail-header',
      scroll: 0,
      bubble: {
        title: 'Detail Actions',
        body: 'Edit or delete the selected crew member, or click Back to return to the list.',
        position: 'below',
      },
    },
    {
      id: 'detail-content',
      target: 'detail-content',
      scroll: 'element',
      bubble: {
        title: 'Crew Details',
        body: 'View all info for this crew member — basic info, roles, and preferences.',
        position: 'left',
      },
    },
  ];
}
