#!/bin/bash

# Test dashboard API and show detailed crew preferences data

API_URL="${API_URL:-http://localhost:4000}"
STORE_ID=768
DATE="2025-12-16"

echo "🔍 Testing dashboard API for store $STORE_ID, date $DATE"
echo "   API URL: $API_URL"
echo ""

# Fetch dashboard logbook data
RESPONSE=$(curl -s "$API_URL/api/stores/$STORE_ID/dashboard/logbooks?dates=$DATE&status=PUBLISHED")

# Check if response is valid JSON
if ! echo "$RESPONSE" | jq . > /dev/null 2>&1; then
  echo "❌ Error: Invalid JSON response"
  echo "$RESPONSE"
  exit 1
fi

# Extract key info
LOGBOOK_COUNT=$(echo "$RESPONSE" | jq '.logbooks | length')
echo "📊 Response contains $LOGBOOK_COUNT logbook(s)"

if [ "$LOGBOOK_COUNT" -eq 0 ]; then
  echo "⚠️  No logbooks found for this date"
  exit 0
fi

# Get first logbook
LOGBOOK=$(echo "$RESPONSE" | jq '.logbooks[0]')

LOGBOOK_ID=$(echo "$LOGBOOK" | jq -r '.logbookId')
LOGBOOK_DATE=$(echo "$LOGBOOK" | jq -r '.date')
CREW_COUNT=$(echo "$LOGBOOK" | jq '.crew | length')

echo ""
echo "📅 Logbook: $LOGBOOK_DATE (ID: $LOGBOOK_ID)"
echo "   Crew count: $CREW_COUNT"

# Show aggregate stats
ELIGIBLE_PREFS=$(echo "$LOGBOOK" | jq '.aggregateStats.eligiblePreferences')
PREFS_MET=$(echo "$LOGBOOK" | jq '.aggregateStats.preferencesMet')
PERCENT_MET=$(echo "$LOGBOOK" | jq '.aggregateStats.percentMet')
AVG_SAT=$(echo "$LOGBOOK" | jq '.aggregateStats.avgSatisfaction')
ELIGIBLE_CREW=$(echo "$LOGBOOK" | jq '.aggregateStats.eligibleCrew')

echo ""
echo "📊 Aggregate Stats:"
echo "   Eligible Preferences: $ELIGIBLE_PREFS"
echo "   Preferences Met: $PREFS_MET"
echo "   Percent Met: $PERCENT_MET%"
echo "   Avg Satisfaction: $AVG_SAT%"
echo "   Eligible Crew: $ELIGIBLE_CREW"

# Show first 5 crew with their preferences
echo ""
echo "👥 First 5 crew members with preferences:"
echo "$LOGBOOK" | jq -r '.crew[] | select(.preferences.total > 0) | [.crewId, .crewName, .preferences.total, .preferences.met, .preferences.satisfaction] | @tsv' | head -5 | while IFS=$'\t' read -r crewId crewName total met satisfaction; do
  if [ "$total" -gt 0 ]; then
    satPct=$(echo "scale=1; ($met / $total) * 100" | bc)
  else
    satPct=0
  fi
  echo "   - $crewId ($crewName): total=$total, met=$met, satisfaction=$satisfaction%, computed_satPct=$satPct%"
done

# Count crew with preferences.total > 0
CREW_WITH_PREFS=$(echo "$LOGBOOK" | jq '[.crew[] | select(.preferences.total > 0)] | length')
echo ""
echo "📊 Crew with preferences.total > 0: $CREW_WITH_PREFS"

# Show crew without preferences
CREW_WITHOUT_PREFS=$(echo "$LOGBOOK" | jq '[.crew[] | select(.preferences.total == 0)] | length')
echo "📊 Crew without preferences: $CREW_WITHOUT_PREFS"

if [ "$CREW_WITHOUT_PREFS" -gt 0 ]; then
  echo ""
  echo "   Sample crew without preferences:"
  echo "$LOGBOOK" | jq -r '.crew[] | select(.preferences.total == 0) | [.crewId, .crewName] | @tsv' | head -3 | while IFS=$'\t' read -r crewId crewName; do
    echo "      - $crewId ($crewName)"
  done
fi

echo ""
echo "✅ Test complete"
