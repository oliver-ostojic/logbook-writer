# Dashboard Snapshot Testing Guide

Complete guide to testing the dashboard snapshot implementation.

## Prerequisites

1. **API Server Running**
   ```bash
   cd apps/api
   export DATABASE_URL="postgresql://user:pass@localhost:5432/logbook"
   pnpm dev
   ```
   API should be running on `http://localhost:4000`

2. **Database with Logbook Data**
   - Ensure you have at least one `Logbook` with `Assignment` data
   - Example store ID: `768`
   - Example dates: `2025-01-01`, `2025-01-02`, `2025-01-03`

3. **Web Server Running** (for full end-to-end test)
   ```bash
   cd apps/web
   pnpm dev
   ```
   Web should be running on `http://localhost:3000`

## Test 1: Unit Tests (✅ Passed)

Test the core snapshot builder logic without any API dependencies.

```bash
cd apps/web
pnpm vitest run src/dashboard/__tests__/buildDashboardSnapshot.test.ts
```

**Expected Output:**
```
✓ src/dashboard/__tests__/buildDashboardSnapshot.test.ts  (6 tests)
  ✓ should handle complete data across 3 dates with 3 crew and 2 roles
  ✓ should handle non-contiguous date selection
  ✓ should handle missing date correctly
  ✓ should handle ties with deterministic tiebreaker
  ✓ should handle degenerate bucket case (all identical values)
  ✓ should handle empty logbooks gracefully

Test Files  1 passed (1)
Tests  6 passed (6)
```

## Test 2: Fastify API Endpoint

Test the new Fastify endpoint that fetches detailed logbook data.

### Check Available Dates

```bash
curl http://localhost:4000/api/stores/768/dashboard/dates | jq
```

**Expected Response:**
```json
{
  "dates": [
    "2025-01-03",
    "2025-01-02",
    "2025-01-01"
  ]
}
```

### Fetch Detailed Logbooks

```bash
curl "http://localhost:4000/api/stores/768/dashboard/logbooks?dates=2025-01-01,2025-01-02" | jq
```

**Expected Response:**
```json
{
  "logbooks": [
    {
      "logbookId": "uuid-here",
      "date": "2025-01-01",
      "storeId": "768",
      "crew": [
        {
          "crewId": "TCRW001",
          "crewName": "Alice",
          "shifts": [
            {
              "shiftId": "uuid",
              "roleId": "1",
              "roleName": "REGISTER",
              "startTime": "2025-01-01T09:00:00.000Z",
              "endTime": "2025-01-01T13:00:00.000Z",
              "satisfactionScore": 5,
              "preferenceMet": true
            }
          ]
        }
      ],
      "roles": [
        {
          "roleId": "1",
          "roleName": "REGISTER",
          "isEnforced": true
        }
      ]
    }
  ]
}
```

## Test 3: Next.js API Endpoint (Full Snapshot)

Test the complete snapshot generation including all metrics.

### Basic Request

```bash
curl "http://localhost:3000/api/dashboard?storeId=768&dates=2025-01-01,2025-01-02,2025-01-03&selectionLabel=Weekly+Report" | jq
```

### Validate Response Structure

```bash
curl -s "http://localhost:3000/api/dashboard?storeId=768&dates=2025-01-01,2025-01-02&selectionLabel=Test" | \
  jq '{
    meta: .meta,
    selection: {
      selectionId: .selection.selectionId,
      label: .selection.label,
      selectedDates: .selection.selectedDates,
      missingDates: .selection.missingDates,
      logbookCount: (.selection.logbooks | length),
      crewCount: (.selection.selectionCrewRollups | length),
      roleCount: (.selection.selectionRoleRollups | length)
    }
  }'
```

**Expected Output:**
```json
{
  "meta": {
    "version": 1,
    "storeId": "768",
    "timezone": "America/New_York",
    "generatedAt": "2025-01-15T23:58:22.000Z"
  },
  "selection": {
    "selectionId": "sel-1234567890",
    "label": "Test",
    "selectedDates": ["2025-01-01", "2025-01-02"],
    "missingDates": [],
    "logbookCount": 2,
    "crewCount": 5,
    "roleCount": 3
  }
}
```

## Test 4: Automated Test Script

Run the complete automated test:

```bash
cd apps/web
./test-dashboard-api.sh
```

Or with custom parameters:

```bash
API_URL=http://localhost:4000 STORE_ID=768 ./test-dashboard-api.sh
```

## Test 5: Validate Specific Metrics

### Crew Metrics

```bash
curl -s "http://localhost:3000/api/dashboard?storeId=768&dates=2025-01-01" | \
  jq '.selection.selectionCrewRollups[0] | {
    crewId,
    crewName,
    avgPreferencesMetPctOverSelection,
    overallRankInSelection,
    preferencesMetSelection,
    preferencesTotalSelection
  }'
```

### Role Metrics

```bash
curl -s "http://localhost:3000/api/dashboard?storeId=768&dates=2025-01-01" | \
  jq '.selection.selectionRoleRollups[0] | {
    roleId,
    roleName,
    isEnforced,
    minutesWorkedOnRoleTotal,
    fairnessIndexPct,
    bucketCount: (.bucketDistribution | length),
    lorenzPoints: (.lorenzCurveData | length)
  }'
```

## Common Issues

### Issue: "Connection refused" or "ECONNREFUSED"

**Solution:** API server is not running. Start it:
```bash
cd apps/api
pnpm dev
```

### Issue: "No dates available"

**Solution:** No logbook data in database. Generate a schedule:
```bash
cd apps/api
# Run solver to generate logbook
curl -X POST http://localhost:4000/solver2/solve \
  -H "Content-Type: application/json" \
  -d '{"storeId": 768, "date": "2025-01-01", "saveLogbook": true}'
```

### Issue: "Invalid JSON response"

**Solution:** Check API logs for errors:
```bash
# In apps/api terminal, check for error messages
```

### Issue: Next.js returns "API error: 404"

**Solution:** Fastify endpoint not registered. Verify `registerDashboardRoutes(app)` is called in `apps/api/src/index.ts`

## Performance Testing

Test with large date ranges:

```bash
# Generate comma-separated dates for last 30 days
DATES=$(node -e "
  const dates = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  console.log(dates.join(','));
")

time curl -s "http://localhost:3000/api/dashboard?storeId=768&dates=$DATES" | jq '.meta'
```

## Success Criteria

✅ All unit tests pass (6/6)
✅ Fastify endpoint returns logbook data in correct format
✅ Next.js endpoint generates complete snapshot with:
  - `meta` object with version, storeId, timezone, generatedAt
  - `selection.logbooks` array with per-day stats
  - `selection.selectionCrewRollups` with cross-date crew aggregates
  - `selection.selectionRoleRollups` with Lorenz curves and bucket distribution
  - `selection.missingDates` correctly identifies dates without data
✅ Satisfaction scores are in 1-5 range
✅ All durations stored as minutes (integer values)
✅ Rankings are deterministic (ties broken by crewId)

## Next Steps

Once all tests pass:

1. **Frontend Integration**: Use snapshot data in React components
2. **Caching**: Add Redis caching for generated snapshots
3. **Real-time Updates**: WebSocket updates when new logbooks published
4. **Export**: Add CSV/PDF export functionality
5. **Comparison**: Support multiple selections for A/B testing

## Support

If issues persist, check:
- `apps/api/src/routes/dashboard.ts` - Fastify endpoint implementation
- `apps/web/app/api/dashboard/route.ts` - Next.js API route
- `apps/web/src/dashboard/buildDashboardSnapshot.ts` - Snapshot builder logic
