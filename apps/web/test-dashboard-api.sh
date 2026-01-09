#!/bin/bash

# Test Dashboard Snapshot API
# This script tests the complete dashboard snapshot flow

API_URL="${API_URL:-http://localhost:4000}"
STORE_ID="${STORE_ID:-768}"

echo "=========================================="
echo "Dashboard Snapshot API Test"
echo "=========================================="
echo ""
echo "API URL: $API_URL"
echo "Store ID: $STORE_ID"
echo ""

# Step 1: Check available dates
echo "Step 1: Fetching available dates..."
DATES_RESPONSE=$(curl -s "${API_URL}/api/stores/${STORE_ID}/dashboard/dates")
echo "Response: $DATES_RESPONSE"
echo ""

# Extract first 3 dates for testing (if available)
DATES=$(echo "$DATES_RESPONSE" | jq -r '.dates[0:3] | join(",")')

if [ "$DATES" == "null" ] || [ -z "$DATES" ]; then
    echo "❌ No dates available for store ${STORE_ID}"
    echo "Please ensure you have logbook data in the database."
    exit 1
fi

echo "✅ Found dates: $DATES"
echo ""

# Step 2: Test Fastify endpoint (detailed logbooks)
echo "Step 2: Testing Fastify endpoint..."
echo "GET ${API_URL}/api/stores/${STORE_ID}/dashboard/logbooks?dates=${DATES}"
echo ""

LOGBOOKS_RESPONSE=$(curl -s "${API_URL}/api/stores/${STORE_ID}/dashboard/logbooks?dates=${DATES}")

# Check if response is valid JSON
if ! echo "$LOGBOOKS_RESPONSE" | jq empty 2>/dev/null; then
    echo "❌ Invalid JSON response from Fastify endpoint"
    echo "Response: $LOGBOOKS_RESPONSE"
    exit 1
fi

LOGBOOK_COUNT=$(echo "$LOGBOOKS_RESPONSE" | jq '.logbooks | length')
echo "✅ Retrieved $LOGBOOK_COUNT logbooks"
echo ""

# Step 3: Test Next.js API endpoint (snapshot generation)
echo "Step 3: Testing Next.js snapshot endpoint..."
echo "GET http://localhost:3000/api/dashboard?storeId=${STORE_ID}&dates=${DATES}&selectionLabel=Test"
echo ""

SNAPSHOT_RESPONSE=$(curl -s "http://localhost:3000/api/dashboard?storeId=${STORE_ID}&dates=${DATES}&selectionLabel=Test")

# Check if response is valid JSON
if ! echo "$SNAPSHOT_RESPONSE" | jq empty 2>/dev/null; then
    echo "❌ Invalid JSON response from Next.js endpoint"
    echo "Response: $SNAPSHOT_RESPONSE"
    exit 1
fi

# Validate snapshot structure
HAS_META=$(echo "$SNAPSHOT_RESPONSE" | jq 'has("meta")')
HAS_SELECTION=$(echo "$SNAPSHOT_RESPONSE" | jq 'has("selection")')
SELECTED_DATES_COUNT=$(echo "$SNAPSHOT_RESPONSE" | jq '.selection.selectedDates | length')
LOGBOOKS_COUNT=$(echo "$SNAPSHOT_RESPONSE" | jq '.selection.logbooks | length')
CREW_ROLLUPS_COUNT=$(echo "$SNAPSHOT_RESPONSE" | jq '.selection.selectionCrewRollups | length')
ROLE_ROLLUPS_COUNT=$(echo "$SNAPSHOT_RESPONSE" | jq '.selection.selectionRoleRollups | length')

echo "Snapshot Structure:"
echo "  - Has meta: $HAS_META"
echo "  - Has selection: $HAS_SELECTION"
echo "  - Selected dates: $SELECTED_DATES_COUNT"
echo "  - Logbooks with data: $LOGBOOKS_COUNT"
echo "  - Crew rollups: $CREW_ROLLUPS_COUNT"
echo "  - Role rollups: $ROLE_ROLLUPS_COUNT"
echo ""

if [ "$HAS_META" == "true" ] && [ "$HAS_SELECTION" == "true" ]; then
    echo "✅ Dashboard snapshot generated successfully!"
    echo ""
    echo "📊 Sample Data:"
    echo "$SNAPSHOT_RESPONSE" | jq '{
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
    echo ""
    echo "🎉 All tests passed!"
else
    echo "❌ Snapshot structure validation failed"
    exit 1
fi
