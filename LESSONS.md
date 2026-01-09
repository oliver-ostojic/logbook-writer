# Lessons Learned

This file tracks mistakes, bugs, and patterns discovered during development to prevent regression.

## UI/React Bugs

### Variable Scope in JSX (2026-01-09)
**Issue:** Used `snapshot` directly in JSX rendering when it was only defined inside a `useMemo` hook.

**Location:** `apps/web/app/stores/[storeId]/fairness-dashboard/page.tsx:2021`

**Wrong:**
```tsx
sparklineData: snapshot.selection.logbooks.map(lb => { ... })
```

**Correct:**
```tsx
sparklineData: dashboardSnapshot?.selection.logbooks.map(lb => { ... }) || []
```

**Why:** `snapshot` is a local variable inside the `useMemo` hook (line ~896). In JSX, we need to reference the state variable `dashboardSnapshot`. Always use optional chaining (`?.`) and provide fallback values when accessing potentially null state.

**Pattern:** When referencing data in JSX, use the state variable, not intermediate variables from hooks.

---

## Display Formatting Patterns

### Displaying Hours with Conditional Decimals (2026-01-09)
**Issue:** Need to display hours with one decimal place, but hide `.0` for whole numbers.

**Location:** `apps/web/app/stores/[storeId]/fairness-dashboard/page.tsx:2039`

**Solution:**
```tsx
// Convert minutes to hours and strip trailing .0
${Number(((minutes || 0) / 60).toFixed(1))} hrs
```

**Why:**
- `toFixed(1)` always returns a string with one decimal (e.g., "2.0", "2.5")
- Wrapping with `Number()` converts back to number, automatically stripping unnecessary `.0`
- Result: `2 hrs` instead of `2.0 hrs`, but keeps `2.5 hrs`

**Pattern:** For conditional decimal display: `Number(value.toFixed(decimalPlaces))`

---

## Data Flow Issues

### Dashboard Metric Calculation Consistency (2026-01-09)
**Issue:** Fairness index showed different values in quick look cards (85.2%) vs individual role sparklines (~5%) for the same role.

**Root Cause:**
1. `computeRoleLogbookStats` was only calculating gini coefficients for enforced roles (from snapshots)
2. `computeRoleSelectionRollups` was only collecting gini from snapshots (which don't exist for non-enforced roles)
3. Sparkline used per-date `roleStats.giniCoefficient`, but quick look used `avgFairnessIndexPct` from different source

**Location:**
- `apps/web/src/dashboard/metrics/computeRoleLogbookStats.ts` (per-date calculation)
- `apps/web/src/dashboard/metrics/computeRoleSelectionRollups.ts` (average calculation)

**Fix:**
1. Calculate gini for ALL roles (not just enforced) from assignment distribution
2. Use Lorenz curve calculation: `calculateGini(minutesDistribution)`
3. Prefer snapshot gini for enforced roles (uses lookback), but fall back to calculated for non-enforced
4. Update selection rollups to collect from `roleStats.giniCoefficient` instead of snapshots

**Why:**
- Both aggregate (avg) and per-date values must use same calculation method
- Snapshots only exist for enforced roles with fairness tracking enabled
- All roles should show fairness metrics based on actual assignment distribution

**Pattern:** When displaying both aggregate and time-series metrics, ensure they derive from the same source data and calculation method.

---

## Categories

- **UI/React Bugs** - Component, state, and rendering issues
- **Display Formatting Patterns** - How to format data for display
- **Data Flow Issues** - Props, state management, data fetching
- **API/Backend Patterns** - Backend conventions and patterns
- **Styling/Tailwind Gotchas** - CSS and styling issues
- **TypeScript Patterns** - Type safety and TypeScript conventions
- **Performance Issues** - Optimization and performance problems
