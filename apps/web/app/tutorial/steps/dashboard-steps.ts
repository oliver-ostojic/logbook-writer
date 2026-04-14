import type { TutorialStep } from '@/components/tutorial-flyover/types';

interface DashboardStepCallbacks {
  storeId: string;
  setViewHint: (view: string | null) => void;
}

export function createDashboardSteps(callbacks: DashboardStepCallbacks): TutorialStep[] {
  const dashRoute = `/stores/${callbacks.storeId}/fairness-dashboard`;

  return [
    // ── Welcome ───────────────────────────────────────────────────────────────

    {
      id: 'dashboard-welcome',
      route: dashRoute,
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      hideBack: true,
      bubble: {
        title: 'Fairness Dashboard',
        body: 'Welcome to the Fairness Dashboard! This gives you a store-level view of how crew preferences and role fairness are trending over time.',
        position: 'center',
      },
    },

    // ── Secondary nav ─────────────────────────────────────────────────────────

    {
      id: 'dashboard-secondary-nav',
      target: 'dashboard-secondary-nav',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      bubble: {
        title: 'Dashboard Navigation',
        body: 'Switch between Overview (store-level charts), Crew (individual member stats), and Roles (per-role fairness) here. A fourth tab slides in when you have a crew member or role selected.',
        position: 'below',
      },
    },

    // ── Time interval header ──────────────────────────────────────────────────

    {
      id: 'dashboard-time-header',
      target: 'dashboard-time-header',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      bubble: {
        title: 'Time Interval Filter',
        body: 'This header controls which date range is used across all charts. Only dates with available data will appear in the header. Fine-tune the window using the month buttons, year dropdown, and the calendar date picker.',
        position: 'below',
      },
    },

    {
      id: 'dashboard-month-pagination',
      target: 'dashboard-month-pagination',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Month Filter',
        body: 'Click any month to toggle all its dates on or off. Bold text means the whole month is selected; a dot below the name means it\'s partially selected. Use the arrows to navigate to earlier months.',
        position: 'below',
      },
    },

    {
      id: 'dashboard-year-dropdown',
      target: 'dashboard-year-dropdown',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Year Filter',
        body: 'Click the year dropdown to select or deselect an entire year of data at once. A red dot next to a year means it\'s only partially selected.',
        position: 'below',
      },
    },

    {
      id: 'dashboard-calendar-btn',
      target: 'dashboard-calendar-btn',
      route: dashRoute,
      scroll: 0,
      onEnter: () => {
        callbacks.setViewHint('dashboard-overview');
        // Close any open Headless UI menus (year dropdown)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      },
      advanceOnInteraction: true,
      bubble: {
        title: 'All Dates',
        body: 'For day-level precision, click here to open the date picker and select specific dates.',
        position: 'below',
      },
    },

    {
      id: 'dashboard-calendar-popup',
      target: 'dashboard-calendar-popup',
      route: dashRoute,
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Date Calendar',
        body: 'Days with logbook data are clickable — highlighted days are included in the current selection. Use this to compare specific dates or exclude outliers from your analysis.',
        position: 'left',
      },
    },

    // ── Overview mini cards (4 individual) ───────────────────────────────────

    {
      id: 'dashboard-mini-fairness-index',
      target: 'dashboard-mini-fairness-index',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => {
        callbacks.setViewHint('dashboard-overview');
        window.dispatchEvent(new CustomEvent('tutorial-close-calendar'));
      },
      interactive: true,
      bubble: {
        title: 'Fairness Index',
        body: 'Measures how evenly role assignments are distributed across all crew over the selected period. 100% means perfectly equal distribution. The sparkline shows how the score has trended.',
        position: 'right',
      },
    },

    {
      id: 'dashboard-mini-fairness-status',
      target: 'dashboard-mini-fairness-status',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Fairness Status by Role',
        body: 'A color-coded breakdown of fairness health per role. Green means distribution is healthy, yellow is a caution, and red means one role\'s assignments are noticeably uneven across crew.',
        position: 'left',
      },
    },

    {
      id: 'dashboard-mini-preferences',
      target: 'dashboard-mini-preferences',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Overall Preferences Met',
        body: 'The percentage of all crew preferences satisfied across every logbook in the selected window. The pie chart gives a quick visual split of met vs. unmet.',
        position: 'right',
      },
    },

    {
      id: 'dashboard-mini-time',
      target: 'dashboard-mini-time',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Time per Shift by Role',
        body: 'Shows the average minutes crew spent on each role per shift. The bar chart breaks down how shift time is divided between roles across your store. Hover over any bar to see more specific data.',
        position: 'left',
      },
    },

    // ── Overview large graphs (3 individual) ─────────────────────────────────

    {
      id: 'overview-graph-line',
      target: 'overview-graph-line',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Preferences Met Over Time',
        body: 'Shows the overall preference satisfaction percentage for each logbook date. Click any dot to highlight that date\'s data. Use this to spot dips after schedule changes or high-demand periods.',
        position: 'above',
      },
    },

    {
      id: 'overview-graph-boxplot',
      target: 'overview-graph-boxplot',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Crew Preference Distribution',
        body: 'A box plot showing the spread of preference satisfaction across all crew. The box spans the 25th–75th percentile; the line inside is the median, and the tail ends show the minimum and maximum.',
        position: 'above',
      },
    },

    {
      id: 'overview-graph-stacked',
      target: 'overview-graph-stacked',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      interactive: true,
      bubble: {
        title: 'Preferences Met by Type',
        body: 'A stacked bar showing how many preferences were met vs. unmet for each preference type. Longer filled sections mean that type is being well-satisfied. Use this to identify which preference categories the solver is struggling with.',
        position: 'above',
      },
    },

    // ── Crew list view ────────────────────────────────────────────────────────

    {
      id: 'dashboard-nav-crew',
      target: 'dashboard-nav-crew',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-overview'),
      advanceOnInteraction: true,
      bubble: {
        title: 'Crew View',
        body: 'Click Crew to see preference statistics for each individual crew member.',
        position: 'below',
      },
    },

    {
      id: 'dashboard-crew-list-view',
      target: 'dashboard-crew-list-view',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-crew'),
      bubble: {
        title: 'Crew List',
        body: 'All crew members with configured preferences are listed here. Each card shows their name and overall preference satisfaction score for the current time window.',
        position: 'above',
      },
    },

    {
      id: 'dashboard-crew-list-cards',
      target: 'dashboard-crew-list-cards',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-crew'),
      advanceOnInteraction: true,
      bubble: {
        title: 'Select a Crew Member',
        body: 'Click any crew member to open their individual statistics panel on the right.',
        position: 'right',
      },
    },

    {
      id: 'dashboard-crew-detail-panel',
      target: 'dashboard-crew-detail-panel',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-crew'),
      bubble: {
        title: 'Crew Statistics',
        body: 'The detail panel shows three charts for the selected crew member: how their preferences have been met over time, the spread of their per-shift satisfaction scores, and a breakdown by preference type.',
        position: 'left',
      },
    },

    // ── Navigate to Roles ─────────────────────────────────────────────────────

    {
      id: 'dashboard-nav-roles',
      target: 'dashboard-nav-roles',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-crew'),
      advanceOnInteraction: true,
      bubble: {
        title: 'Roles View',
        body: 'Click Roles to see fairness statistics broken down by each role in your store.',
        position: 'below',
      },
    },

    {
      id: 'dashboard-role-product-card',
      target: 'dashboard-role-product-card',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-roles'),
      advanceOnInteraction: true,
      bubble: {
        title: 'Role List',
        body: 'Each card shows a role\'s fairness index and trend. Click Product to dive into its detailed statistics.',
        position: 'right',
      },
    },

    // ── Product role detail ───────────────────────────────────────────────────

    {
      id: 'role-detail-mini-fairness-index',
      target: 'role-detail-mini-fairness-index',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-role:Product'),
      hideBack: true,
      interactive: true,
      bubble: {
        title: 'Fairness Index — Product',
        body: 'Measures how evenly Product assignments are distributed across crew historically. A score close to 100% means everyone gets a fair share of Product time.',
        position: 'right',
      },
    },

    {
      id: 'role-detail-mini-time-share',
      target: 'role-detail-mini-time-share',
      route: dashRoute,
      scroll: 0,
      onEnter: () => callbacks.setViewHint('dashboard-role:Product'),
      interactive: true,
      bubble: {
        title: 'Time Share — Product',
        body: 'What percentage of total working time across your store is spent on Product. The pie chart gives a quick visual of Product time vs. everything else.',
        position: 'left',
      },
    },

    {
      id: 'role-detail-boxplot',
      target: 'role-detail-boxplot',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-role:Product'),
      interactive: true,
      bubble: {
        title: 'Mins/Shift Spread',
        body: 'This box plot shows the distribution of minutes each crew member spent on Product per shift. A wide box means some crew are consistently getting much more or less Product time than others — a sign of uneven assignment.',
        position: 'left',
      },
    },

    {
      id: 'role-detail-heatmap',
      target: 'role-detail-heatmap',
      route: dashRoute,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-role:Product'),
      interactive: true,
      bubble: {
        title: 'Weekly Assignment Heatmap',
        body: 'Shows how many average hours each crew member worked on Product per week. Darker cells mean more time on the role that week. Scan vertically to see which crew members consistently get the most Product time.',
        position: 'left',
      },
    },

    {
      id: 'role-detail-table',
      target: 'role-detail-table',
      route: dashRoute,
      interactive: true,
      scroll: 'element',
      onEnter: () => callbacks.setViewHint('dashboard-role:Product'),
      bubble: {
        title: 'Crew Fairness Details',
        body: 'A per-crew breakdown showing total minutes on Product, last assignment date, and deviation from the group average. Crew highlighted in red are significantly above or below the team average — use this to spot fairness imbalances and inform future scheduling. That\'s the full tour!',
        position: 'above',
      },
    },
  ];
}
