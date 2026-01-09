# Dashboard Snapshot Generator

Complete implementation of a JSON-based dashboard snapshot system for the logbook application.

## Overview

This module generates comprehensive dashboard snapshots containing all metrics needed for client-side visualization without recomputation. It leverages existing backend data sources:

- **LogPreferenceMetadata** - Aggregate preference stats per logbook
- **PreferenceSatisfaction** - Per-crew preference satisfaction
- **RoleFairnessSnapshot** - Role fairness metrics with lookback window
- **CrewRoleFairnessHistory** - Per-crew per-role minutes history
- **Assignment** - Individual time block assignments

## Key Concepts

### Satisfaction is Per-Crew Per-Day, NOT Per-Assignment

**Important:** Satisfaction represents how many of a crew member's **preferences** were met (e.g., FIRST_HOUR, FAVORITE, CONSECUTIVE), not how "satisfying" each individual assignment was.

- Alice has 3 preferences for the day
- 2 out of 3 were satisfied
- Her satisfaction = **67%** for the entire day
- This value applies to all her assignments that day (for time-series plotting)

### Assignments vs Shifts

- **Assignment**: A single time block (e.g., 9:00-11:00 on Register)
- **Shift**: All assignments for one crew member in one day
- One crew member = One shift per day = Multiple assignments

### Fairness Uses Lookback Windows

Role fairness metrics come from `RoleFairnessSnapshot`, which uses configurable lookback windows (e.g., 14 days) and is normalized by days worked. This provides more accurate fairness than single-day calculations.

## Architecture

```
src/dashboard/
├── types.ts                    # Complete type definitions
├── buildDashboardSnapshot.ts   # Main builder function
├── metrics/
│   ├── statUtils.ts                         # Statistical utilities
│   ├── lorenzCurve.ts                       # Lorenz curve & Gini coefficient
│   ├── bucketDistribution.ts                # Quantile-based bucketing
│   ├── computeCrewLogbookStats.ts          # Per-crew daily metrics
│   ├── computeRoleLogbookStats.ts          # Per-role daily metrics
│   ├── computeCrewSelectionRollups.ts      # Cross-date crew aggregates
│   └── computeRoleSelectionRollups.ts      # Cross-date role aggregates
└── __tests__/
    └── buildDashboardSnapshot.test.ts       # Comprehensive test suite
```

## Input Data Structure

The dashboard expects data in this format (provided by the adapter):

```typescript
interface LogbookInput {
  logbookId: string;
  date: string; // "YYYY-MM-DD"
  storeId: string;

  // Crew with assignments and preference stats
  crew: Array<{
    crewId: string;
    crewName: string;
    assignments: Array<{
      assignmentId: string;
      roleId: string;
      roleName: string;
      startTime: string; // ISO datetime
      endTime: string;
    }>;
    preferences: {
      total: number;        // Total preferences for this crew
      met: number;          // Preferences met
      satisfaction: number; // 0-1 scale (average satisfaction)
    };
  }>;

  // Roles
  roles: Array<{
    roleId: string;
    roleName: string;
    isEnforced: boolean; // Fairness tracking enabled
  }>;

  // Aggregate stats from LogPreferenceMetadata
  aggregateStats: {
    eligiblePreferences: number;
    preferencesMet: number;
    percentMet: number;
    avgSatisfaction: number; // 0-100
    breakdownByRoleRule: Array<{
      roleRuleId: number;
      ruleType: string; // FIRST_HOUR, FAVORITE, etc.
      eligible: number;
      met: number;
      avgSatisfaction: number;
      percentMet: number;
    }>;
  };

  // Role fairness snapshots from RoleFairnessSnapshot
  roleFairnessSnapshots: Array<{
    roleId: string;
    giniCoefficient: number;
    fairnessIndex: number; // 0-100
    fairnessGrade: string; // A+ to F
    minMinutesPerDay: number;
    maxMinutesPerDay: number;
    avgMinutesPerDay: number;
    stdDeviation: number;
    eligibleCrew: number;
    crewWithMinutes: number;
    lookbackDays: number;
  }>;
}
```

## Usage

### Programmatic Usage

```typescript
import { buildDashboardSnapshot } from './buildDashboardSnapshot';

const snapshot = buildDashboardSnapshot({
  storeId: "768",
  timezone: "America/New_York",
  selectionId: "report-123",
  selectionLabel: "Weekly Analysis",
  selectedDates: ["2025-01-01", "2025-01-02", "2025-01-03"],
  logbooks: [...] // LogbookInput[]
});
```

## Metrics Provided

### Per Crew (per day)
- Satisfaction % (preferences met / total preferences)
- Satisfaction rank
- Delta from crew average
- Total minutes worked
- Average minutes per assignment by role
- Last assigned date by role
- Deviation from median assignment duration

### Per Role (per day)
- Average minutes per assignment
- Total minutes worked
- Crew assigned count
- Fairness score (std deviation from RoleFairnessSnapshot)
- Fairness grade (A+ to F)
- Gini coefficient
- Min/max/avg minutes per day (from lookback)
- Time share %

### Per Day (aggregate)
- Overall satisfaction %
- Total preferences
- Preferences met
- Breakdown by rule type (FIRST_HOUR, FAVORITE, etc.)

### Selection Rollups (across dates)
**Crew:**
- Average satisfaction % over selection
- Overall rank
- Satisfaction time series (one point per day)
- Role metrics aggregated

**Role:**
- Minutes worked on role vs total work %
- Average fairness index
- Lorenz curve data
- Bucket distribution
- By-date averages

## Data Adapter (Step 3)

**Next step:** Build the adapter in `apps/api/src/routes/dashboard.ts` to:

1. Fetch logbooks with all required relations:
   - Logbook → LogPreferenceMetadata
   - Logbook → Assignment → Crew, Role
   - Logbook → PreferenceSatisfaction
   - Role → RoleFairnessTracker
   - RoleFairnessSnapshot (by date + roleId)

2. Transform to LogbookInput format:
   - Group assignments by crew
   - Aggregate PreferenceSatisfaction per crew
   - Map RoleFairnessSnapshot to input format
   - Extract LogPreferenceMetadata

3. Return transformed data via `/api/stores/:storeId/dashboard/logbooks`

## Key Design Decisions

### 1. Minutes-Only Storage
All durations are stored as integer minutes from midnight (0-1440). UI layer converts to hrs/min display format.

### 2. Non-Contiguous Dates
Selection treats dates as a set, not an interval. `selectedDates` can be any arbitrary dates. Rollups aggregate only over those specific dates.

### 3. Quantile-Based Bucketing
Bucket count is adaptive: `min(10, max(4, floor(sqrt(crewCount))))`. Uses equal-frequency (quantile) bucketing, not equal-width.

### 4. Deterministic Ranking
All rankings use value descending, with crewId ascending as tiebreaker for stability.

### 5. Pure Functions
All metric computations are pure functions with no side effects. State is immutable.

### 6. Uses Actual Backend Data
No recomputation of fairness or satisfaction - uses the actual values from LogPreferenceMetadata and RoleFairnessSnapshot that the solver/system generated.

## Testing

Run tests with:
```bash
cd apps/web
pnpm test src/dashboard
```

**Note:** Tests may need updating to match the new types and data sources.

## Changes from Original Design

### What Changed:
1. **Removed per-assignment satisfaction** - Satisfaction is per-crew per-day only
2. **Renamed "shifts" to "assignments"** - Clearer terminology
3. **Added aggregate stats** - From LogPreferenceMetadata
4. **Added fairness snapshots** - From RoleFairnessSnapshot (with lookback)
5. **Added day-level aggregate** - Overall satisfaction per day
6. **Changed satisfaction time series** - From per-shift to per-day
7. **Added breakdown by rule type** - FIRST_HOUR, FAVORITE, etc.

### Why:
- Matches the actual data model
- Uses existing computed metrics (no recomputation)
- Proper lookback-based fairness
- Clearer separation of concepts

## License

See project LICENSE.
