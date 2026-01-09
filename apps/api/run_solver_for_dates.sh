#!/bin/bash

STORE_ID=768
DATES=("2025-11-25" "2025-12-13" "2025-12-15" "2025-12-16")

echo "🚀 Running solver for store $STORE_ID on ${#DATES[@]} dates..."
echo ""

for date in "${DATES[@]}"; do
  echo "📅 Processing $date..."
  
  response=$(curl -s -X POST http://localhost:4000/solver/v2/solve \
    -H "Content-Type: application/json" \
    -d "{
      \"storeId\": $STORE_ID,
      \"date\": \"$date\",
      \"timeLimitSeconds\": 30
    }")
  
  # Check if successful
  if echo "$response" | grep -q '"success":true'; then
    echo "✅ Success for $date"
  else
    echo "❌ Failed for $date"
    echo "   Response: $response" | head -c 200
    echo ""
  fi
  
  echo ""
  sleep 1
done

echo "✨ Done!"
