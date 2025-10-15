#!/bin/bash

# Debug script for Strava webhook issues
# Replace these with your actual values
CLIENT_ID="33643"
CLIENT_SECRET="34cb7a447e4f9e756fe8f880cef09bd53ea88cdc"

echo "=== Checking Strava Webhook Subscription ==="
echo ""

# Check current webhook subscription
echo "Current webhook subscription:"
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=$CLIENT_ID \
  -d client_secret=$CLIENT_SECRET

echo -e "\n\n=== Testing Webhook Endpoint ==="
echo ""

# Test webhook endpoint with fake event
echo "Sending test webhook event..."
curl -X POST "https://veloready.app/.netlify/functions/webhooks-strava" \
  -H "Content-Type: application/json" \
  -d '{
    "object_type": "activity",
    "aspect_type": "create",
    "owner_id": 104662,
    "object_id": 99999999,
    "subscription_id": 12345,
    "event_time": 1234567890
  }'

echo -e "\n\n=== Checking if webhook endpoint responds to GET (verification) ==="
echo ""

# Test GET request (Strava verification)
curl -X GET "https://veloready.app/.netlify/functions/webhooks-strava?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=f87a2d4c9b5e4a7f98e6b2c3d1a4f6e9"

echo -e "\n\nDone!"
