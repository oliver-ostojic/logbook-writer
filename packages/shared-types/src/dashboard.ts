// =============================================================================
// Fairness Dashboard Data Types
// =============================================================================
// This file defines the shape of the JSON data used to populate the dashboard.
// The data is generated based on the selected time interval and fetched via API.
// =============================================================================

// -----------------------------------------------------------------------------
// Time Range
// -----------------------------------------------------------------------------
// TODO: Define time range interface
// - start date
// - end date
// - interval type (day, week, month, year)

// -----------------------------------------------------------------------------
// Crew Data
// -----------------------------------------------------------------------------
// TODO: Define crew member data
// - id, name
// - satisfaction score & history
// - preferences met/not met
// - shifts worked in period

// -----------------------------------------------------------------------------
// Role Data
// -----------------------------------------------------------------------------
// TODO: Define role data
// - id, name, emoji
// - gini coefficient & trend
// - crew count assigned
// - hours distribution (avg, median, max deviation)
// - lorenz curve data

// -----------------------------------------------------------------------------
// Overview Stats
// -----------------------------------------------------------------------------
// TODO: Define aggregate stats for overview dashboard
// - total preferences met %
// - average satisfaction
// - fairness score
// - constraint violations

// -----------------------------------------------------------------------------
// Main Dashboard Data
// -----------------------------------------------------------------------------
// TODO: Define the root interface that combines all sections
// export interface DashboardData {
//   timeRange: TimeRange;
//   crew: CrewData[];
//   roles: RoleData[];
//   overview: OverviewStats;
// }

// THIS IS MY ACTUAL WORK
// -----------------------------------------------------------------------------
// Dashboard Panel
// -----------------------------------------------------------------------------
export interface DashboardPanel {
    header: Header;
}
// Header
export interface Header {
    title: string;
    timeInterval: TimeInterval;
}
export interface TimeInterval {
    startDay: number; // e.g. 7 for 7th day of month
    endDay: number;   // e.g. 13 for 13th day of month
    month: string;     // must be 3 letters long, e.g. 'Jan'
    year: number;      // must be 2 numbers long, e.g. 26
}
// -----------------------------------------------------------------------------
// Side Panel
// -----------------------------------------------------------------------------
// Time selection interface
export interface SidePanel {
    timeSelectionCard: TimeSelectionCard;
}
export interface TimeSelectionCard {
    dates: DashboardDate[];
}

/**
 * A date representation for the dashboard
 * Named to avoid conflict with built-in Date type
 */
export interface DashboardDate {
    day: number;
    month: number; // e.g. 1 for January
    year: number;  // e.g. 2026
}