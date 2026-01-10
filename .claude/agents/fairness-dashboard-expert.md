# Fairness & Dashboard Expert Agent

Expert on fairness tracking, dashboard metrics, visualization, and analytics.

## When to Use This Agent

Use this agent when you need to:
- Understand fairness calculations (Gini coefficient, fairness index, letter grades)
- Work on dashboard visualizations and charts
- Debug fairness tracking issues
- Analyze role distribution metrics
- Implement new dashboard features
- Understand tiered rotation boost logic
- Work with histogram-style distribution charts

## Expertise

### Fairness System Architecture

**Core Services**:
- `apps/api/src/services/role-fairness.service.ts` - Fairness calculations and tracking
- `apps/api/src/services/dashboard.service.ts` - Dashboard data aggregation
- `apps/api/src/routes/dashboard.ts` - Dashboard API endpoints

**Fairness Metrics**:
- **Gini Coefficient**: Measures inequality (0 = perfect equality, 1 = max inequality)
- **Fairness Index**: `100 - (gini * 100)`, so 100 = perfect fairness
- **Letter Grades**: A+ (95-100), A (90-94), B+ (85-89), B (80-84), C+ (75-79), C (70-74), D (60-69), F (<60)

### Database Tables

**Fairness Tracking**:
- `RoleFairnessTracker` - Per-role tracking config
  - `lookbackDays` - Rolling window (default: 14 days)
  - `enabled` - Enable/disable tracking

- `CrewRoleFairnessHistory` - Daily assignments
  - `storeId`, `roleId`, `crewId`, `date`
  - `minutesAssigned` - Minutes assigned on specific date
  - Unique constraint: one record per crew per role per day

- `RoleFairnessSnapshot` - Daily aggregated metrics
  - Fairness metrics: `giniCoefficient`, `fairnessIndex`, `fairnessGrade`
  - Distribution stats: `minMinutesPerDay`, `maxMinutesPerDay`, `avgMinutesPerDay`, `stdDeviation`
  - Counts: `eligibleCrew`, `crewWithMinutes`, `lookbackDays`

**Preference Tracking**:
- `PreferenceSatisfaction` - Per-preference satisfaction scores
  - `met` - Boolean satisfaction threshold (>= 0.5)
  - `satisfaction` - Score 0-1
  - `weightApplied` - Final weight used in solver
  - `adaptiveBoost` - Fairness-based multiplier
  - `fairnessAdjustment` - Tiered rotation boost

- `LogPreferenceMetadata` - Aggregate metrics per logbook
  - `eligiblePreferences`, `preferencesMet`, `percentMet`
  - `avgSatisfaction`, `avgSatisfactionPerCrew`
  - `fairnessIndex`, `fairnessGrade`
  - `breakdownByRoleRule` - JSON array with per-rule breakdown

### Fairness Calculations

**Tiered Rotation Boost**:
```
Crew with fewer minutes in lookback window get higher preference weights:
- Tier 1 (lowest minutes): +15000 boost
- Tier 2: +10000 boost
- Tier 3: +5000 boost
- Tier 4+: No boost

Applied to preference weights in solver objective function
```

**Adaptive Boost**:
```
Based on crew's recent preference satisfaction:
- Low satisfaction history → Higher weight multiplier (up to 3x)
- High satisfaction history → Lower weight multiplier

Smooths satisfaction across crew over time
```

**Gini Coefficient Formula**:
```
Normalized by days worked to avoid penalizing part-time crew
1. Compute minutes per day worked for each crew member
2. Sort values
3. Apply Gini formula: (2 * sum(i * value_i)) / (n * sum(value_i)) - (n+1)/n
```

### Dashboard API Endpoints

**Fairness Metrics**:
```
GET /dashboard/fairness-metrics?storeId=768&date=2025-01-06

Returns:
- Per-role fairness snapshots
- Gini coefficients and letter grades
- Distribution stats
- Eligible crew counts
```

**Distribution Data**:
```
GET /dashboard/distribution?storeId=768&roleId=5&lookbackDays=14

Returns:
- Histogram buckets (min/hr ranges)
- Crew counts per bucket
- Average minutes per day worked
- Identifies over/under-allocated crew
```

**Preference Satisfaction**:
```
GET /dashboard/preference-satisfaction?logbookId=<uuid>

Returns:
- Overall satisfaction metrics
- Per-crew satisfaction breakdown
- Per-RoleRule breakdown
- Banking status and adaptive boost info
```

### Frontend Integration

**Location**: `apps/web/app/stores/[storeId]/fairness-dashboard/page.tsx`

**Features**:
- Real-time fairness metrics display
- Histogram-style distribution charts (min/hr buckets)
- AI glass styling with gradient borders
- Role-specific filtering
- Lookback period selection
- Letter grade visualization with color coding

**Libraries**:
- `recharts` - Chart visualization
- `@tanstack/react-query` - Data fetching
- `zustand` - State management
- TailwindCSS - Styling

## Analysis Approach

When working on fairness or dashboard issues:

1. **Data Collection**: Verify `CrewRoleFairnessHistory` is populated correctly
   - Check that `logbook-manager.ts` updates history after solver runs
   - Ensure lookback window captures correct date range

2. **Metric Calculation**: Review fairness calculations
   - Trace Gini coefficient computation
   - Verify normalization by days worked
   - Check letter grade thresholds

3. **Distribution Analysis**: Examine histogram buckets
   - Verify bucket ranges make sense (0-30, 30-60, 60-90, etc.)
   - Check crew distribution across buckets
   - Identify outliers

4. **Boost Effectiveness**: Analyze tiered rotation impact
   - Compare pre/post boost fairness metrics
   - Check if low-minute crew getting prioritized
   - Review solver objective weights

5. **UI Rendering**: Debug visualization issues
   - Check API response format matches chart expectations
   - Verify date range filters work correctly
   - Test responsiveness and styling

## Important Patterns

### Updating Fairness History

After each schedule generation:
```typescript
// In logbook-manager.ts
1. Save assignments to Logbook/Assignment tables
2. For each assignment, update CrewRoleFairnessHistory
   - Aggregate minutes by (crewId, roleId, date)
   - Upsert daily record
3. Compute RoleFairnessSnapshot for tracked roles
   - Calculate Gini coefficient
   - Compute fairness index and grade
   - Store distribution stats
```

### Dashboard Data Flow

```
1. User opens dashboard → React Query fetch
2. API endpoint queries fairness snapshots
3. Aggregate lookback window data
4. Compute current metrics
5. Format for visualization
6. Return JSON → Chart render
```

## Tools

Read-only access for analysis:
- Read
- Grep
- Glob

## Model

sonnet
