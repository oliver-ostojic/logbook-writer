# Shift Satisfaction Box Plot Investigation

## Overview
Investigated the "no data available" issue for the shift satisfaction box plot in the single crew dashboard.

## Investigation Summary

### ✅ What's Working
1. **Database Storage** - Satisfaction data IS being stored correctly in `LogPreferenceMetadata.breakdownByCrew`
   - Verified 4 recent logbooks all have valid preference data
   - Example: Logbook 2025-12-16 has 51 crew with preferences (total, met, avgSatisfaction)

2. **API Response** - The `/api/stores/:storeId/dashboard/logbooks` endpoint IS returning correct data
   - Tested with store 768, date 2025-12-16
   - Returns 51 crew with preferences.total > 0
   - Example crew: `1307265` has total=6, met=4, satisfaction=65.625%

3. **Overall Dashboard** - The main fairness dashboard box plot works fine
   - Uses `computedSatisfactionBoxPlot` which aggregates all crew satisfaction across all logbooks
   - This successfully shows distribution data

### ❌ The Problem: Single Crew Dashboard

The box plot for **individual crew members** (when you click on a crew card) shows "no data available" because:

**Root Cause**: The box plot tries to display satisfaction spread across multiple shifts/dates for ONE crew member, but the data source `selectedCrew.satisfactionByDate` is empty.

### Data Flow for Single Crew View

1. User clicks on crew card → sets `selectedCrew` state
2. Box plot section (lines 1899-1970 in page.tsx) computes box plot from:
   ```typescript
   const values = (selectedCrew.satisfactionByDate || [])
     .map(d => d.satisfactionPct)
     .sort((a, b) => a - b);
   ```
3. If `values.length === 0`, shows "No satisfaction data available"

### Where satisfactionByDate Comes From

**Source**: `apps/web/src/dashboard/metrics/computeCrewSelectionRollups.ts` lines 66-75

```typescript
const satisfactionByDate: SatisfactionByDate[] = [];
logbooks.forEach(lb => {
  const crewStat = lb.crewStats.find(cs => cs.crewId === crewId);
  if (!crewStat) return;  // ⚠️ Skips if crew not in this logbook

  satisfactionByDate.push({
    date: lb.logbook.date,
    satisfactionPct: crewStat.satisfactionPct,  // Computed from preferences met/total
  });
});
```

**Key Point**: This array will be empty if:
- The crew didn't appear in ANY of the selected logbooks
- The crew has 0 preferences in all selected logbooks
- The date selection doesn't include any dates where this crew worked

### Verification Steps Performed

1. ✅ Checked database schema - `LogPreferenceMetadata` has `breakdownByCrew` JSON field
2. ✅ Queried database directly - Found valid satisfaction data for multiple logbooks
3. ✅ Tested API endpoint - Returns correct crew preferences data
4. ✅ Verified data transformation - Frontend correctly maps API response to internal types

## Diagnosis: Debug Checklist

### For the User to Check:

1. **Browser Console Logs**
   - Open browser console when viewing a crew member's dashboard
   - Look for these logs (lines 1905-1906 in page.tsx):
     ```
     📊 Box plot - selectedCrew.satisfactionByDate: [...]
     📊 Box plot - values after sort: [...]
     ```
   - If the first array is `[]` or `undefined`, that confirms the issue

2. **Check Date Selection**
   - What dates are currently selected in the dashboard?
   - Does the crew member have work scheduled on those dates?
   - Try selecting different dates or a wider date range

3. **Crew-Specific Issues**
   - Does this happen for ALL crew members or just specific ones?
   - Are some crew members working but have 0 preferences? (They won't show satisfaction data)

4. **Data Availability**
   - How many logbooks are in the current selection?
   - Do those logbooks have PUBLISHED status?

## Possible Causes & Solutions

### Cause 1: Crew Not in Selected Dates
**Symptom**: satisfactionByDate is empty because crew didn't work on selected dates

**Solution**: Select dates where the crew actually worked, or expand date range

**Check**: Look at crew card - does it show work history for the selected dates?

### Cause 2: Crew Has No Preferences
**Symptom**: Crew appears in assignments but has preferencesTotal = 0

**Solution**: This is expected behavior - crew without preferences won't have satisfaction data

**Check**: Look at API response - does this crew have `preferences.total > 0`?

### Cause 3: Missing Logbook Data
**Symptom**: Selected dates don't have published logbooks

**Solution**: Run solver for the selected dates and ensure logbooks are published

**Check**: Query database for logbooks with those dates and PUBLISHED status

### Cause 4: Frontend Filtering Bug
**Symptom**: Data exists but is filtered out during computation

**Solution**: Check computeCrewSelectionRollups logic - maybe crew is excluded for some reason

**Check**: Add console.logs in computeCrewSelectionRollups to see if crew appears in crewMap

## Files Investigated

1. **Frontend Components**
   - `apps/web/app/stores/[storeId]/fairness-dashboard/page.tsx` (lines 1899-1970)
   - `apps/web/app/stores/[storeId]/fairness-dashboard/components/GraphCardWithStatsTransparent.tsx`

2. **Data Processing**
   - `apps/web/src/dashboard/buildDashboardSnapshot.ts`
   - `apps/web/src/dashboard/metrics/computeCrewSelectionRollups.ts` (lines 66-75)
   - `apps/web/src/dashboard/metrics/computeCrewLogbookStats.ts` (line 43)
   - `apps/web/src/dashboard/types.ts`

3. **API**
   - `apps/api/src/routes/dashboard.ts` (lines 98-354)
   - `apps/api/src/services/crew-rule-satisfaction.ts` (lines 1035-1049)
   - `apps/api/src/services/logbook-manager.ts`

4. **Database**
   - `apps/api/prisma/schema.prisma` (LogPreferenceMetadata model)

## Test Scripts Created

1. **Database Check**: `apps/api/scripts/check-preference-metadata.ts`
   - Queries recent logbooks and shows breakdownByCrew data
   - Run: `cd apps/api && npx tsx scripts/check-preference-metadata.ts`

2. **API Test**: `test-dashboard-api-detailed.sh`
   - Tests API endpoint and shows crew preferences
   - Run: `./test-dashboard-api-detailed.sh`

## Next Steps

1. **Immediate**: Check browser console logs when viewing a crew member's dashboard
2. **Verify**: Ensure the selected date range includes dates where the crew worked
3. **Debug**: Add console.log in computeCrewSelectionRollups to trace crew processing
4. **Report**: Share the console logs and selected date range for further investigation

## Key Finding

**The satisfaction data exists and flows correctly from database → API → frontend, but the single crew view's `satisfactionByDate` array is empty, likely because:**
- The crew isn't in the selected date range
- The selected dates don't have published logbooks
- There's a filtering/computation issue in computeCrewSelectionRollups

**Action Required**: Check browser console logs and verify date selection to confirm which specific issue is occurring.
