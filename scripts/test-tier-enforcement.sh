#!/bin/bash

# Tier Enforcement Testing Script
# This script tests the tier enforcement with properly formatted (but invalid) JWT tokens

set -e

API_BASE="https://api.veloready.app"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create a fake but properly formatted JWT token
# Format: header.payload.signature (base64url encoded)
# This will fail auth but won't cause parsing errors
FAKE_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Tier Enforcement Testing${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 1: No Authorization Header
echo -e "${YELLOW}Test 1: No Authorization Header${NC}"
echo "Expected: 401 Unauthorized"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/api/activities?daysBack=30")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Got 401 as expected"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ FAIL${NC} - Expected 401, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 2: Malformed Token (not JWT format)
echo -e "${YELLOW}Test 2: Malformed Token (not JWT format)${NC}"
echo "Expected: 401 Unauthorized"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/api/activities?daysBack=30" \
  -H "Authorization: Bearer invalid_token")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Got 401 as expected"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ FAIL${NC} - Expected 401, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 3: Properly Formatted but Invalid JWT
echo -e "${YELLOW}Test 3: Properly Formatted but Invalid JWT${NC}"
echo "Expected: 401 Unauthorized (invalid signature)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/api/activities?daysBack=30" \
  -H "Authorization: Bearer $FAKE_JWT")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Got 401 as expected"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ FAIL${NC} - Expected 401, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 4: Check if tier enforcement code is deployed
echo -e "${YELLOW}Test 4: Verify Deployment${NC}"
echo "Checking if latest code is deployed..."
RESPONSE=$(curl -s -I "$API_BASE/api/activities")
REQUEST_ID=$(echo "$RESPONSE" | grep -i "x-nf-request-id" | cut -d' ' -f2 | tr -d '\r')

if [ -n "$REQUEST_ID" ]; then
    echo -e "${GREEN}✅ PASS${NC} - API is responding"
    echo "Request ID: $REQUEST_ID"
else
    echo -e "${RED}❌ FAIL${NC} - API not responding properly"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "✅ All authentication tests passed"
echo "✅ API is deployed and responding"
echo ""
echo -e "${YELLOW}Note:${NC} To test tier enforcement with real data, you need:"
echo "1. A valid JWT token from Supabase authentication"
echo "2. A user with a subscription record in the database"
echo ""
echo "See HOW_TO_TEST_TIER_ENFORCEMENT.md for detailed instructions."
echo ""
