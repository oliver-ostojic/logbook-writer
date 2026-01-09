/**
 * Dashboard Service
 * 
 * Fetches logbook data and transforms it into dashboard-ready JSON
 * for the fairness dashboard UI.
 */

import { PrismaClient } from '@prisma/client';
import type {
  DashboardPanel,
  Header,
  TimeInterval,
  SidePanel,
  TimeSelectionCard,
  DashboardDate,
} from '@logbook-writer/shared-types';

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Get 3-letter month abbreviation from month number (0-indexed)
 */
function getMonthAbbr(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month] || 'Jan';
}

/**
 * Get 2-digit year from full year
 */
function getTwoDigitYear(year: number): number {
  return year % 100;
}

// -----------------------------------------------------------------------------
// Data Types for Internal Use
// -----------------------------------------------------------------------------

export interface LogbookSummary {
  id: string;
  date: Date;
  status: string;
  metadata: {
    solver?: {
      status: string;
      runtimeMs: number;
      objectiveScore: number;
      numCrew: number;
      numAssignments: number;
    };
    schedule?: {
      totalAssignments: number;
      crewScheduled: number;
      totalHours: number;
    };
    preferences?: {
      total: number;
      met: number;
      averageSatisfaction: number;
    };
  } | null;
  preferenceMetadata: {
    eligiblePreferences: number;
    preferencesMet: number;
    percentMet: number;
    avgSatisfaction: number;
    fairnessIndex: number;
    fairnessGrade: string;
  } | null;
}

export interface DashboardServiceOptions {
  storeId: number;
  startDate: Date;
  endDate: Date;
}

// -----------------------------------------------------------------------------
// Main Service Functions
// -----------------------------------------------------------------------------

/**
 * Fetch all logbooks for a store within a date range
 */
export async function fetchLogbooksForDateRange(
  options: DashboardServiceOptions
): Promise<LogbookSummary[]> {
  const { storeId, startDate, endDate } = options;

  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      LogPreferenceMetadata: true,
    },
    orderBy: { date: 'asc' },
  });

  return logbooks.map((logbook) => ({
    id: logbook.id,
    date: logbook.date,
    status: logbook.status,
    metadata: logbook.metadata as LogbookSummary['metadata'],
    preferenceMetadata: logbook.LogPreferenceMetadata
      ? {
          eligiblePreferences: logbook.LogPreferenceMetadata.eligiblePreferences,
          preferencesMet: logbook.LogPreferenceMetadata.preferencesMet,
          percentMet: logbook.LogPreferenceMetadata.percentMet,
          avgSatisfaction: logbook.LogPreferenceMetadata.avgSatisfaction,
          fairnessIndex: logbook.LogPreferenceMetadata.fairnessIndex,
          fairnessGrade: logbook.LogPreferenceMetadata.fairnessGrade,
        }
      : null,
  }));
}

/**
 * Build the TimeInterval from a date range
 */
export function buildTimeInterval(startDate: Date, endDate: Date): TimeInterval {
  return {
    startDay: startDate.getDate(),
    endDay: endDate.getDate(),
    month: getMonthAbbr(startDate.getMonth()),
    year: getTwoDigitYear(startDate.getFullYear()),
  };
}

/**
 * Build TimeSelectionCard dates from logbooks
 */
export function buildTimeSelectionCard(logbooks: LogbookSummary[]): TimeSelectionCard {
  const dates: DashboardDate[] = logbooks.map((logbook) => ({
    day: logbook.date.getDate(),
    month: logbook.date.getMonth() + 1, // 1-indexed for display
    year: logbook.date.getFullYear(),
  }));

  return { dates };
}

/**
 * Build the full dashboard panel data
 */
export function buildDashboardPanel(
  title: string,
  startDate: Date,
  endDate: Date
): DashboardPanel {
  return {
    header: {
      title,
      timeInterval: buildTimeInterval(startDate, endDate),
    },
  };
}

/**
 * Build the side panel data
 */
export function buildSidePanel(logbooks: LogbookSummary[]): SidePanel {
  return {
    timeSelectionCard: buildTimeSelectionCard(logbooks),
  };
}

/**
 * Main function: Generate complete dashboard JSON
 */
export async function generateDashboardData(
  options: DashboardServiceOptions & { title?: string }
): Promise<{
  panel: DashboardPanel;
  sidePanel: SidePanel;
  logbooks: LogbookSummary[];
}> {
  const { storeId, startDate, endDate, title = 'Fairness Dashboard' } = options;

  // Fetch logbooks from database
  const logbooks = await fetchLogbooksForDateRange({ storeId, startDate, endDate });

  // Build dashboard structures
  const panel = buildDashboardPanel(title, startDate, endDate);
  const sidePanel = buildSidePanel(logbooks);

  return {
    panel,
    sidePanel,
    logbooks,
  };
}

// -----------------------------------------------------------------------------
// Standalone Test Runner
// -----------------------------------------------------------------------------

async function main() {
  const storeId = 768;
  
  // Test with a week range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 7);

  console.log('='.repeat(80));
  console.log('DASHBOARD SERVICE TEST');
  console.log('='.repeat(80));
  console.log(`\nStore ID: ${storeId}`);
  console.log(`Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  try {
    const dashboardData = await generateDashboardData({
      storeId,
      startDate,
      endDate,
      title: 'Test Fairness Dashboard',
    });

    console.log('\n📊 Dashboard Panel:');
    console.log(JSON.stringify(dashboardData.panel, null, 2));

    console.log('\n📅 Side Panel (Time Selection):');
    console.log(JSON.stringify(dashboardData.sidePanel, null, 2));

    console.log(`\n📚 Found ${dashboardData.logbooks.length} logbooks:`);
    for (const logbook of dashboardData.logbooks) {
      const dateStr = logbook.date.toISOString().split('T')[0];
      const satisfaction = logbook.preferenceMetadata?.avgSatisfaction?.toFixed(1) ?? 'N/A';
      const fairness = logbook.preferenceMetadata?.fairnessGrade ?? 'N/A';
      console.log(`   ${dateStr} | Status: ${logbook.status} | Satisfaction: ${satisfaction}% | Fairness: ${fairness}`);
    }

    console.log('\n✅ Dashboard JSON generated successfully!');
    console.log('\n📦 Full JSON Output:');
    console.log(JSON.stringify(dashboardData, null, 2));


  } catch (error) {
    console.error('\n❌ Error generating dashboard data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly (ESM compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
