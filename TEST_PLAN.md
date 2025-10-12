# VeloReady Strava OAuth - End-to-End Test Plan

## Overview
This document outlines the testing strategy for the enhanced Strava OAuth implementation, including deauth cleanup, privacy enforcement, streams API, and ops dashboard.

---

## 1. Deauthorization Tests

### 1.1 User-Initiated Deauth
**Endpoint:** `GET /api/me/strava/disconnect?strava_athlete_id={id}`

**Test Cases:**
- ✅ **Happy path**: Valid athlete ID disconnects successfully
  - Expected: 200 OK, athlete deleted from DB, audit log entry created
- ❌ **Missing athlete ID**: Request without `strava_athlete_id` param
  - Expected: 400 Bad Request, error message
- ❌ **Non-existent athlete**: Request with invalid athlete ID
  - Expected: 200 OK (idempotent), no error
- ✅ **Audit log verification**: Check `audit_log` table after disconnect
  - Expected: Entry with `kind='deauth'`, `note='user requested'`

**Manual Test:**
```bash
# Test disconnect
curl "https://veloready.app/api/me/strava/disconnect?strava_athlete_id=104662"

# Verify in DB
psql $DATABASE_URL -c "SELECT * FROM audit_log WHERE kind='deauth' ORDER BY created_at DESC LIMIT 5;"
psql $DATABASE_URL -c "SELECT * FROM athlete WHERE id=104662;"
```

---

### 1.2 Webhook-Driven Deauth
**Endpoint:** `POST /webhooks/strava`

**Test Cases:**
- ✅ **Deauth webhook**: Strava sends `authorized=false` update
  - Expected: Athlete deleted, audit log entry with `note='webhook'`
- ✅ **Other webhooks**: Activity create/update/delete still work
  - Expected: No interference with existing webhook handling
- ✅ **Verification handshake**: GET request with `hub.challenge`
  - Expected: 200 OK with challenge echoed back

**Manual Test:**
```bash
# Simulate deauth webhook
curl -X POST https://veloready.app/webhooks/strava \
  -H "Content-Type: application/json" \
  -d '{
    "object_type": "athlete",
    "aspect_type": "update",
    "owner_id": 104662,
    "updates": { "authorized": "false" }
  }'

# Verify in DB
psql $DATABASE_URL -c "SELECT * FROM audit_log WHERE kind='deauth' AND note='webhook' ORDER BY created_at DESC LIMIT 1;"
```

---

## 2. Privacy/Visibility Enforcement Tests

### 2.1 Streams API Privacy
**Endpoint:** `GET /api/request-streams?activity_id={id}&athlete_id={id}&keys={keys}`

**Test Cases:**
- ✅ **Public activity**: Any athlete can access
  - Expected: 200 OK, streams data returned
- ❌ **Private activity, wrong athlete**: Athlete A tries to access Athlete B's private activity
  - Expected: 403 Forbidden, error message
- ✅ **Private activity, owner**: Athlete accesses their own private activity
  - Expected: 200 OK, streams data returned
- ❌ **Missing params**: Request without `activity_id` or `athlete_id`
  - Expected: 400 Bad Request
- ❌ **Non-existent activity**: Request for activity not in DB
  - Expected: 404 Not Found
- ❌ **Unauthenticated athlete**: Athlete not in DB or no access token
  - Expected: 401 Unauthorized

**Manual Test:**
```bash
# Test public activity (should work)
curl "https://veloready.app/api/request-streams?activity_id=12345&athlete_id=104662&keys=time,distance,altitude"

# Test private activity with wrong athlete (should fail)
curl "https://veloready.app/api/request-streams?activity_id=67890&athlete_id=999999&keys=time,distance,altitude"

# Test private activity with owner (should work)
curl "https://veloready.app/api/request-streams?activity_id=67890&athlete_id=104662&keys=time,distance,altitude"
```

---

### 2.2 Visibility States
**Test all Strava visibility states:**
- `everyone` (public)
- `followers_only` (semi-private)
- `only_me` (private)

**Test Cases:**
- ✅ Verify DB stores correct visibility from Strava API
- ✅ Verify privacy enforcement respects `private` flag
- ✅ Verify privacy enforcement respects `visibility='only_me'`

---

## 3. Ops Dashboard Tests

### 3.1 Metrics JSON API
**Endpoint:** `GET /ops/metrics.json`

**Test Cases:**
- ✅ **Metrics structure**: Verify JSON structure matches spec
  - Expected: `athletes`, `activities`, `deauths`, `timestamp` keys
- ✅ **Athlete counts**: Verify total, valid tokens, expired tokens
- ✅ **Activity counts**: Verify total, last 24h, visibility breakdown
- ✅ **Deauth counts**: Verify last 7 days count and recent log
- ✅ **Performance**: Response time < 2s
- ✅ **Caching**: Verify `Cache-Control: no-cache` header

**Manual Test:**
```bash
# Fetch metrics
curl https://veloready.app/ops/metrics.json | jq

# Verify structure
curl https://veloready.app/ops/metrics.json | jq 'keys'
# Expected: ["activities", "athletes", "deauths", "timestamp"]
```

---

### 3.2 Dashboard UI
**Endpoint:** `GET /ops` or `GET /ops/`

**Test Cases:**
- ✅ **Page loads**: Dashboard HTML renders correctly
- ✅ **Metrics display**: All metrics populate from JSON API
- ✅ **Deauth log**: Recent deauths table displays correctly
- ✅ **Visibility breakdown**: Activity visibility chart renders
- ✅ **Auto-refresh**: Dashboard refreshes every 30s
- ✅ **Manual refresh**: Refresh button works
- ✅ **Error handling**: Displays error if API fails

**Manual Test:**
```bash
# Open in browser
open https://veloready.app/ops

# Verify:
# - Metrics load and display
# - Deauth log shows recent entries
# - Visibility breakdown shows activity counts
# - Timestamp updates on refresh
```

---

## 4. Integration Tests

### 4.1 Full OAuth Flow with Deauth
**Scenario:** User connects, then disconnects

**Steps:**
1. User initiates OAuth: `GET /oauth/strava/start`
2. User authorizes on Strava
3. Callback exchanges code for token: `GET /oauth/strava/callback?code={code}`
4. Verify athlete in DB with valid token
5. User disconnects: `GET /api/me/strava/disconnect?strava_athlete_id={id}`
6. Verify athlete removed from DB
7. Verify audit log entry created

**Expected Result:** Clean disconnect with no orphaned data

---

### 4.2 Webhook Deauth Flow
**Scenario:** User deauthorizes via Strava settings

**Steps:**
1. User has active connection (athlete in DB)
2. User goes to Strava settings and revokes VeloReady
3. Strava sends deauth webhook: `POST /webhooks/strava`
4. Verify athlete removed from DB
5. Verify audit log entry with `note='webhook'`
6. Verify no errors in function logs

**Expected Result:** Automatic cleanup triggered by webhook

---

### 4.3 Streams API with Privacy
**Scenario:** Fetch streams for private vs public activities

**Steps:**
1. Create test activity (public)
2. Fetch streams as owner: `GET /api/request-streams?activity_id={id}&athlete_id={owner}`
3. Verify streams returned
4. Fetch streams as different athlete
5. Verify streams returned (public activity)
6. Change activity to private in Strava
7. Sync activity to DB (via webhook or manual)
8. Fetch streams as different athlete
9. Verify 403 Forbidden
10. Fetch streams as owner
11. Verify streams returned

**Expected Result:** Privacy enforcement works correctly

---

## 5. Database Schema Tests

### 5.1 Required Tables
Verify these tables exist:
- `athlete` (id, access_token, refresh_token, expires_at, scopes, created_at, updated_at)
- `activity` (id, athlete_id, private, visibility, created_at, updated_at, ...)
- `audit_log` (id, kind, ref_id, note, created_at)

**Manual Test:**
```sql
-- Check tables exist
\dt

-- Check athlete schema
\d athlete

-- Check activity schema
\d activity

-- Check audit_log schema
\d audit_log
```

---

### 5.2 Cascade Deletes
Verify cascading deletes work:
- Deleting athlete should delete related activities
- Deleting athlete should NOT delete audit logs (for compliance)

**Manual Test:**
```sql
-- Insert test athlete
INSERT INTO athlete (id, access_token, refresh_token, expires_at, created_at, updated_at)
VALUES (999999, 'test_token', 'test_refresh', now() + interval '1 hour', now(), now());

-- Insert test activity
INSERT INTO activity (id, athlete_id, start_date, type, created_at, updated_at)
VALUES (888888, 999999, now(), 'Ride', now(), now());

-- Delete athlete
DELETE FROM athlete WHERE id = 999999;

-- Verify activity deleted
SELECT * FROM activity WHERE id = 888888;
-- Expected: 0 rows

-- Verify audit log preserved (if any)
SELECT * FROM audit_log WHERE ref_id = '999999';
```

---

## 6. Error Handling Tests

### 6.1 Network Errors
- ❌ Strava API timeout
- ❌ Strava API 5xx error
- ❌ Database connection failure

**Expected:** Graceful error handling, proper HTTP status codes

---

### 6.2 Token Expiry
- ❌ Expired access token when fetching streams
- ✅ Token refresh flow (if implemented)

**Expected:** 401 Unauthorized or automatic token refresh

---

## 7. Performance Tests

### 7.1 Load Testing
**Metrics to measure:**
- Streams API response time (target: <1s)
- Metrics API response time (target: <2s)
- Webhook processing time (target: <500ms)
- Dashboard page load time (target: <2s)

**Tools:**
```bash
# Apache Bench
ab -n 100 -c 10 https://veloready.app/ops/metrics.json

# cURL timing
curl -w "@curl-format.txt" -o /dev/null -s https://veloready.app/api/request-streams?activity_id=12345&athlete_id=104662&keys=time,distance
```

---

### 7.2 Database Query Performance
**Verify indexes exist:**
- `athlete(id)` - primary key
- `activity(athlete_id)` - foreign key
- `activity(private, visibility)` - for privacy checks
- `audit_log(kind, created_at)` - for metrics queries

---

## 8. Security Tests

### 8.1 SQL Injection
- ❌ Test with malicious `athlete_id` values
- ❌ Test with malicious `activity_id` values

**Expected:** Parameterized queries prevent injection

---

### 8.2 Authorization Bypass
- ❌ Try to access private activity without proper athlete_id
- ❌ Try to disconnect another athlete's account

**Expected:** Proper authorization checks prevent bypass

---

## 9. Monitoring & Alerts

### 9.1 Metrics to Monitor
- Deauth rate (spikes indicate issues)
- Token expiry rate
- API error rates
- Webhook processing failures
- Database connection pool exhaustion

---

### 9.2 Alerts to Configure
- Deauth spike: >10 deauths in 1 hour
- High error rate: >5% of requests failing
- Token expiry: >50% of tokens expired
- Slow queries: >2s response time

---

## 10. Rollback Plan

### If Issues Arise:
1. **Revert code**: `git revert` to previous working version
2. **Database rollback**: Restore from backup if schema changes
3. **Disable features**: Use feature flags to disable new endpoints
4. **Monitor**: Check logs and metrics for errors

---

## Test Execution Checklist

- [ ] Run all unit tests
- [ ] Run all integration tests
- [ ] Test in staging environment
- [ ] Verify database migrations
- [ ] Test OAuth flow end-to-end
- [ ] Test deauth flows (user + webhook)
- [ ] Test streams API with privacy
- [ ] Test ops dashboard
- [ ] Load test all endpoints
- [ ] Security audit
- [ ] Review logs for errors
- [ ] Deploy to production
- [ ] Monitor for 24h post-deployment

---

## Success Criteria

✅ All test cases pass
✅ No errors in function logs
✅ Ops dashboard displays correct metrics
✅ Privacy enforcement works correctly
✅ Deauth cleanup works for both user and webhook flows
✅ Performance targets met (<1s streams, <2s metrics)
✅ Zero data leaks or security issues
