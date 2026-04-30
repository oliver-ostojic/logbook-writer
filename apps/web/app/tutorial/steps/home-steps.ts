import type { TutorialStep } from '@/components/tutorial-flyover/types';
import { createCrewSteps } from './crew-steps';
import { createDashboardSteps } from './dashboard-steps';

interface HomeStepCallbacks {
  storeId: string;
  crewId: string;
  setViewHint: (view: string | null) => void;
}

export function createHomeSteps(callbacks: HomeStepCallbacks): TutorialStep[] {
  const homeRoute = `/stores/${callbacks.storeId}/home`;
  const shiftsRoute = `/stores/${callbacks.storeId}/logbook/create/shifts?date=2025-12-15`;
  const constraintsRoute = `/stores/${callbacks.storeId}/logbook/create/constraints?date=2025-12-15`;

  return [
    {
      id: 'welcome',
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('home'),
      bubble: {
        title: 'Welcome!',
        body: 'This guided tour will walk you through the key features of the Logbook Writer. Most of the site will be disabled throughout the walkthrough, although you may be prompted to interact with the site at times. Hit next to start!',
        position: 'center',
      },
    },
    {
      id: 'top-nav',
      target: 'top-nav',
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('home'),
      bubble: {
        title: 'Top Navigation',
        body: 'Navigate between the Home dashboard, Fairness Dashboard, and Settings from here.',
        position: 'below',
      },
    },
    {
      id: 'view-tabs',
      target: 'view-tabs',
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('home'),
      bubble: {
        title: 'View Tabs',
        body: 'Switch between Activity, Crew, Logbooks, Roles, and Preferences. Each tab shows a different list view and CRUD interfaces.',
        position: 'below',
      },
    },
    {
      id: 'activity-feed',
      target: 'activity-feed',
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('home'),
      bubble: {
        title: 'Activity Feed',
        body: 'See and filter recent activity for this store — solver runs, logbook generations, edits, and comments from your team.',
        position: 'above',
      },
    },
    {
      id: 'view-tab-crew',
      target: 'view-tab-crew',
      scroll: 0,
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('home'),
      advanceOnInteraction: true,
      bubble: {
        title: 'Crew Tab',
        body: '**Click Crew** to open the crew management interface — one of several CRUD views available from this navigation bar.',
        position: 'below',
      },
    },
    {
      id: 'crew-header',
      target: 'crew-header',
      scroll: 0,
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('crew'),
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
      route: homeRoute,
      advanceOnInteraction: true,
      onEnter: () => callbacks.setViewHint('crew'),
      bubble: {
        title: 'Crew List',
        body: 'All crew members for this store. **Click a name** to view their details.',
        position: 'right',
      },
    },
    {
      id: 'detail-header',
      target: 'detail-header',
      scroll: 0,
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('crew'),
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
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('crew'),
      bubble: {
        title: 'Crew Details',
        body: 'View all info for this crew member — basic info, roles, and preferences.',
        position: 'left',
      },
    },

    // ── Logbook creator ──────────────────────────────────────────────────────

    {
      id: 'logbooks-add-btn',
      target: 'logbooks-add-btn',
      scroll: 0,
      route: homeRoute,
      onEnter: () => callbacks.setViewHint('logbooks'),
      advanceOnInteraction: true,
      bubble: {
        title: 'Create a Logbook',
        body: 'The Logbooks tab lists every logbook generated for this store. **Click Add** to open the logbook creator and build today\'s schedule.',
        position: 'right',
      },
    },
    {
      id: 'logbook-creator-intro',
      target: 'logbook-progress-bar',
      route: shiftsRoute,
      bubble: {
        title: 'Logbook Creator',
        body: 'Welcome to the actual Logbook Writer! This interface contains four stages that are required to create a logbook. First, crew shifts must be added, then constraints are set, then the logbook is generated and edits can be made, and lastly the logbook is published. ',
        position: 'below',
      },
    },
    {
      id: 'logbook-step-1',
      target: 'logbook-step-1',
      route: shiftsRoute,
      bubble: {
        title: 'Step 1 — Choose the Date',
        body: 'First you will select the date you\'re scheduling for. For tutorial purposes, we have a date selected with pre-existing data.',
        position: 'right',
      },
    },
    {
      id: 'logbook-step-2',
      target: 'logbook-step-2',
      route: shiftsRoute,
      scroll: 'element',
      interactive: true,
      bubble: {
        title: 'Step 2 — Select Crew',
        body: 'Now you can search and add crew members to work the selected date. Start and end times can be adjusted in the table.',
        position: 'left',
      },
    },
    {
      id: 'logbook-continue-btn',
      target: 'logbook-continue-btn',
      route: shiftsRoute,
      scroll: 'element',
      advanceOnInteraction: true,
      bubble: {
        title: 'Continue to Constraints',
        body: 'When your crew shifts look right, **click here** to save them and move on to defining role rules and coverage windows.',
        position: 'above',
      },
    },

    // ── Constraints page ────────────────────────────────────────────────────

    {
      id: 'constraints-step-1',
      target: 'constraints-step-1',
      route: constraintsRoute,
      scroll: 'element',
      bubble: {
        title: 'Step 1 — Coverage Windows',
        body: 'Define time windows for roles that need continuous coverage. Select a role, set a start time, choose a duration, and specify how many crew are needed per minute.',
        position: 'right',
      },
    },
    {
      id: 'constraints-role-card',
      target: 'constraints-role-card',
      route: constraintsRoute,
      scroll: 'element',
      interactive: true,
      bubble: {
        title: 'Role Card',
        body: 'Each role card has a start time picker, a duration selector, and a crew-per-minute counter. Fill in all three fields and the checkmark will appear to confirm the role is fully configured.',
        position: 'right',
      },
    },
    {
      id: 'constraints-step-2',
      target: 'constraints-step-2',
      route: constraintsRoute,
      scroll: 'element',
      bubble: {
        title: 'Step 2 — Daily Requirements',
        body: 'Assign daily hour requirements to individual crew members for each role. Each card represents one crew-role pairing.',
        position: 'right',
      },
    },
    {
      id: 'constraints-crew-card',
      target: 'constraints-crew-card',
      route: constraintsRoute,
      scroll: 'element',
      interactive: true,
      bubble: {
        title: 'Crew Assignment Card',
        body: '**Click a card** to select that crew member for the role. Once selected, use the + and − buttons to increase or decrease the number of hours assigned for the specific role listed.',
        position: 'right',
      },
    },
    {
      id: 'constraints-step-3',
      target: 'constraints-step-3',
      route: constraintsRoute,
      scroll: 'element',
      interactive: true,
      bubble: {
        title: 'Step 3 — Hourly Staffing',
        body: '**Click on different hours** to see staffing data for each time slot. This view shows how many crew are available per hour for each role. If a role was configured as a coverage window in Step 1, it will show a "Configured in Step 1" note instead of hourly inputs.',
        position: 'right',
      },
    },
    {
      id: 'constraints-finish-btn',
      target: 'constraints-finish-btn',
      route: constraintsRoute,
      scroll: 'element',
      advanceOnInteraction: true,
      bubble: {
        title: 'Generate Logbook',
        body: 'Once all constraints are set, **click here** to save your configuration and generate the logbook.',
        position: 'above',
      },
    },

    // ── Preview page ─────────────────────────────────────────────────────────
    // No route — the app navigates here naturally after generating the logbook.

    {
      id: 'preview-stats-bar',
      target: 'preview-stats-bar',
      scroll: 0,
      bubble: {
        title: 'Logbook Stats',
        body: 'After generation, the solver reports four key metrics: how many preferences each crew member was granted on average, what percentage of all preferences were met overall, the solver\'s runtime, and a fairness score for preference distribution.',
        position: 'below',
      },
    },
    {
      id: 'preview-preferences-stats',
      target: 'preview-preferences-stats',
      scroll: 0,
      bubble: {
        title: 'Preference Metrics',
        body: 'Per-Crew Avg shows the average preference satisfaction per crew member. Overall Met shows what percentage of all eligible preferences across the whole schedule were satisfied. Both compare against your store\'s 14-day historical baseline.',
        position: 'below',
      },
    },
    {
      id: 'preview-fairness-stat',
      target: 'preview-fairness-stat',
      scroll: 0,
      bubble: {
        title: 'Fairness Score',
        body: 'Fairness measures how evenly preferences towards role assignments are distributed across crew for this logbook. A higher score means no one is consistently having preferences unmet — the solver balances preference history across your team and grades the current logbook based on historical data.',
        position: 'below',
      },
    },
    {
      id: 'preview-logbook-table',
      target: 'preview-logbook-table',
      scroll: 'element-start',
      bubble: {
        title: 'Logbook Preview',
        body: 'This table shows the full schedule. Each row is a crew member, and each colored bubble represents a role assignment for that time slot. You can filter by shift start time using the dropdown.',
        position: 'above',
      },
    },
    {
      id: 'preview-first-row',
      target: 'preview-first-row',
      scroll: 'element',
      bubble: {
        title: 'Crew Row',
        body: 'Each row shows one crew member\'s assignments across their shift. The colored bubbles indicate which role they\'re assigned to each 30-minute slot. Bubbles in the same hour that share a role are merged together.',
        position: 'above',
      },
    },
    {
      id: 'preview-crew-name-enter',
      target: 'preview-crew-name',
      scroll: 'element',
      advanceOnInteraction: 'dblclick',
      bubble: {
        title: 'Enter Edit Mode',
        body: 'Now **double-click the crew member\'s name** to enter edit mode for that row. The name will turn bold to indicate you\'re in edit mode.',
        position: 'right',
      },
    },
    {
      id: 'preview-first-row-edit',
      target: 'preview-first-row',
      scroll: 'element',
      interactive: true,
      advanceOnCustomEvent: true,
      bubble: {
        title: 'Make an Edit',
        body: 'In edit mode, each 30-minute slot becomes individually clickable. **Click any role bubble** to open a dropdown and reassign it to a different role.',
        position: 'above',
      },
    },
    {
      id: 'preview-crew-name-exit',
      target: 'preview-crew-name',
      scroll: 'element',
      advanceOnInteraction: 'dblclick',
      bubble: {
        title: 'Exit Edit Mode',
        body: '**Double-click the name again** to exit edit mode and commit your changes. The Publish button will show a count of how many edits are pending.',
        position: 'right',
      },
    },
    {
      id: 'preview-publish-btn',
      target: 'preview-publish-btn',
      scroll: 'element',
      advanceOnInteraction: true,
      bubble: {
        title: 'Publish',
        body: 'When the schedule looks right, **click Publish** to save all edits and make the logbook live for your team.',
        position: 'below',
      },
    },

    // ── Publish success page ──────────────────────────────────────────────────
    // No route — the app navigates here after publishing.

    {
      id: 'preview-published-card',
      target: 'preview-published-card',
      scroll: 0,
      bubble: {
        title: 'Logbook Published!',
        body: 'Your logbook is now live. You can download a PDF copy for the floor, or head back to the home page to see it listed under Logbooks. That wraps up the logbook creation tour!',
        position: 'above',
      },
    },

    // ── Crew preferences ────────────────────────────────────────────────────

    ...createCrewSteps({
      storeId: callbacks.storeId,
      crewId: callbacks.crewId,
      setViewHint: callbacks.setViewHint,
    }),

    // ── Fairness Dashboard ───────────────────────────────────────────────────

    ...createDashboardSteps({
      storeId: callbacks.storeId,
      setViewHint: callbacks.setViewHint,
    }),
  ];
}
