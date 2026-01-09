/**
 * Dashboard Snapshot API Route
 *
 * GET /api/dashboard?storeId=xxx&dates=2025-01-01,2025-01-03&selectionLabel=MyReport
 *
 * Returns complete dashboard snapshot JSON for selected dates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildDashboardSnapshot } from '../../../src/dashboard/buildDashboardSnapshot';
import type { LogbookInput } from '../../../src/dashboard/types';

// NOTE: This is a placeholder implementation. In production, you would:
// 1. Fetch logbook data from your API or database
// 2. Transform Prisma/API data into LogbookInput format
// 3. Pass to buildDashboardSnapshot

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId');
    const datesParam = searchParams.get('dates');
    const selectionLabel = searchParams.get('selectionLabel') || 'Dashboard Report';

    // Validate required parameters
    if (!storeId) {
      return NextResponse.json(
        { error: 'Missing required parameter: storeId' },
        { status: 400 }
      );
    }

    if (!datesParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: dates' },
        { status: 400 }
      );
    }

    // Parse dates (comma-separated ISO dates)
    const selectedDates = datesParam.split(',').map(d => d.trim());

    // Validate dates format
    for (const date of selectedDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { error: `Invalid date format: ${date}. Expected YYYY-MM-DD` },
          { status: 400 }
        );
      }
    }

    // TODO: Fetch logbook data from your API/database
    // This is a placeholder - replace with actual data fetching logic
    const logbooks = await fetchLogbooksForDates(storeId, selectedDates);

    // Build snapshot
    const snapshot = buildDashboardSnapshot({
      storeId,
      timezone: 'America/New_York', // TODO: Get from store settings
      selectionId: `sel-${Date.now()}`, // Generate unique ID
      selectionLabel,
      selectedDates,
      logbooks,
    });

    // Return JSON response
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Dashboard snapshot error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Fetch logbooks for selected dates from Fastify API
 *
 * @param storeId Store ID
 * @param dates Array of ISO date strings
 * @returns Array of LogbookInput (only dates with data)
 */
async function fetchLogbooksForDates(
  storeId: string,
  dates: string[]
): Promise<LogbookInput[]> {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const datesQuery = dates.join(',');

  try {
    const response = await fetch(
      `${apiUrl}/api/stores/${storeId}/dashboard/logbooks?dates=${datesQuery}&status=PUBLISHED`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store', // Don't cache dashboard data
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // API returns { logbooks: LogbookInput[] }
    // The transformation is already done in the Fastify endpoint
    return data.logbooks || [];
  } catch (error) {
    console.error('Error fetching logbooks from API:', error);
    throw error;
  }
}
