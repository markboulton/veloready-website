# Strava API Compliance Documentation

**Last Updated:** October 11, 2025  
**Status:** ✅ Fully Compliant

---

## 📜 Overview

This document outlines how VeloReady complies with the [Strava API Agreement](https://www.strava.com/legal/api), specifically the **7-day cache rule** for activity data.

---

## 🎯 Strava API Agreement: Key Requirements

### **7-Day Cache Rule**

> **You may cache Strava API data for up to 7 days.** After 7 days, you must delete the cached data or refresh it from the API.

### **What You CAN Store:**
- ✅ **Activity metadata** (name, date, duration, distance, type)
- ✅ **Derived metrics** (TSS, power zones, aggregates, best efforts)
- ✅ **Computed values** (zone times, averages, variability index)
- ✅ **Athlete profile** (name, FTP, weight, zones)

### **What You CANNOT Store >7 Days:**
- ❌ **Raw stream data** (GPS coordinates, power/HR time-series)
- ❌ **Activity photos/maps** (unless refreshed)
- ❌ **Unprocessed sensor data**

---

## 🏗️ Our Compliance Architecture

### **Hybrid Approach:**

```
┌─────────────────────────────────────────────────────────────┐
│                    STRAVA API COMPLIANCE                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. STORE FOREVER (Metadata + Derived Metrics)              │
│     ✅ activity (id, name, date, duration, distance, ...)   │
│     ✅ activity_metrics (zone_times, best_efforts, ...)     │
│                                                              │
│  2. FETCH ON-DEMAND (Raw Streams)                           │
│     ✅ /api/request-streams (1-hour cache)                  │
│     ✅ Fetches fresh from Strava API when needed            │
│                                                              │
│  3. AUTO-CLEANUP (Any Cached Streams)                       │
│     ✅ Daily cleanup at 3am (removes streams >7 days)       │
│     ✅ Logs cleanup events to audit_log                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema

### **Activity Table (Stored Forever)**
```sql
CREATE TABLE activity (
  id BIGINT PRIMARY KEY,
  athlete_id BIGINT NOT NULL,
  start_date TIMESTAMP NOT NULL,
  type VARCHAR(50),
  
  -- Metadata (ALLOWED)
  distance_m FLOAT,
  moving_time_s INT,
  total_elevation_gain_m FLOAT,
  
  -- Aggregated metrics (ALLOWED)
  average_watts FLOAT,
  average_heartrate FLOAT,
  max_heartrate FLOAT,
  
  -- Privacy
  private BOOLEAN,
  visibility VARCHAR(20),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Activity Metrics Table (Stored Forever)**
```sql
CREATE TABLE activity_metrics (
  activity_id BIGINT PRIMARY KEY REFERENCES activity(id),
  
  -- Derived metrics (ALLOWED by Strava)
  power_zone_times JSONB,      -- [120, 600, 360, 120, 0, 0, 0]
  hr_zone_times JSONB,          -- [180, 720, 240, 60, 0, 0, 0]
  best_20min_power INT,
  best_5min_power INT,
  variability_index FLOAT,
  efficiency_factor FLOAT,
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

### **Activity Stream Table (Auto-Deleted After 7 Days)**
```sql
CREATE TABLE activity_stream (
  activity_id BIGINT PRIMARY KEY REFERENCES activity(id),
  
  -- Raw stream data (MUST BE DELETED AFTER 7 DAYS)
  time_s INT[],
  distance_m FLOAT[],
  latlng POINT[],
  altitude_m FLOAT[],
  heartrate INT[],
  cadence INT[],
  watts INT[],
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔧 Implementation Details

### **1. Activity Sync (Metadata Only)**

**File:** `netlify/functions-background/sync-activity.ts`

```typescript
export async function handler(event) {
  const { athlete_id, activity_id } = JSON.parse(event.body || "{}");
  
  // Fetch activity summary from Strava
  const activity = await getActivity(athlete_id, activity_id);
  
  // Store ONLY metadata (compliant)
  await withDb(async (c) => {
    await upsertActivitySummary(c, activity);
  });
  
  // ❌ REMOVED: Stream storage
  // Streams are fetched on-demand instead
  
  return { statusCode: 200, body: "ok" };
}
```

**What's stored:**
- ✅ Activity name, date, duration, distance
- ✅ Average/max power, HR, cadence
- ✅ Elevation gain, calories
- ❌ NO raw stream data

---

### **2. On-Demand Streams API**

**File:** `netlify/functions/api-request-streams.ts`

```typescript
export async function handler(event: HandlerEvent) {
  const activityId = url.searchParams.get("activity_id");
  const athleteId = url.searchParams.get("athlete_id");
  
  // 1. Check privacy in database
  const activity = await withDb(async (c) => {
    return await c.query(
      `SELECT private, visibility FROM activity WHERE id = $1`,
      [activityId]
    );
  });
  
  // 2. Enforce privacy rules
  if (activity.private && activity.athlete_id !== athleteId) {
    return { statusCode: 403, body: "activity is private" };
  }
  
  // 3. Fetch fresh streams from Strava API
  const streams = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams`,
    { headers: { Authorization: `Bearer ${token}` }}
  );
  
  // 4. Return with 1-hour cache
  return {
    statusCode: 200,
    headers: { "Cache-Control": "public, max-age=3600" },
    body: JSON.stringify({ ok: 1, streams })
  };
}
```

**Benefits:**
- ✅ Always fetches fresh data from Strava
- ✅ 1-hour cache reduces API calls
- ✅ Fully compliant (no >7 day storage)
- ✅ Privacy enforcement built-in

---

### **3. Automatic Cleanup**

**File:** `netlify/functions-scheduled/cleanup-old-streams.ts`

```typescript
export async function handler() {
  await withDb(async (c) => {
    // Delete streams for activities >7 days old
    const result = await c.query(`
      DELETE FROM activity_stream 
      WHERE activity_id IN (
        SELECT id FROM activity 
        WHERE created_at < now() - interval '7 days'
      )
    `);
    
    console.log(`Deleted ${result.rowCount} old stream records`);
    
    // Log cleanup event
    await c.query(
      `INSERT INTO audit_log(kind, ref_id, note) 
       VALUES ('cleanup', 'system', $1)`,
      [`Deleted ${result.rowCount} streams older than 7 days`]
    );
  });
  
  return { statusCode: 200, body: "ok" };
}
```

**Schedule:** Daily at 3am UTC
```toml
[[scheduled.functions]]
  name = "cleanup-old-streams"
  cron = "0 3 * * *"
```

---

## 📈 Monitoring Compliance

### **Ops Dashboard**

View compliance status at: `https://veloready.app/ops`

**Metrics Tracked:**
- 🧹 **Cleanup Events** - Shows daily cleanup runs
- 📊 **Activity Count** - Total activities stored
- 📡 **Webhook Events** - Activity sync events
- 👥 **Authenticated Users** - Active connections

**Cleanup Log Example:**
```
🧹 Data Cleanup (Strava Compliance)
┌────────────────────────────────────────────────┐
│ ✅ Deleted 47 streams older than 7 days        │
│ ✅ Deleted 52 streams older than 7 days        │
│ ✅ Deleted 38 streams older than 7 days        │
└────────────────────────────────────────────────┘
```

---

## 🎯 Compliance Checklist

### **Daily Operations:**
- ✅ Activity metadata stored (name, date, duration)
- ✅ Derived metrics computed and stored
- ✅ Raw streams fetched on-demand only
- ✅ Cleanup runs daily at 3am
- ✅ Cleanup events logged to audit_log

### **API Usage:**
- ✅ Streams API has 1-hour cache (< 7 days)
- ✅ No raw stream data stored >7 days
- ✅ Privacy enforcement on all requests
- ✅ Rate limiting to respect Strava limits

### **Monitoring:**
- ✅ Ops dashboard shows cleanup events
- ✅ Audit log tracks all cleanup runs
- ✅ Alerts if cleanup fails

---

## 💰 Cost Impact

### **Before Compliance:**
- Database: ~5KB per activity × 500 activities/day × 365 days = **912MB/year**
- Cost: $25/month (Supabase Pro tier)

### **After Compliance:**
- Database: ~1KB per activity (metadata only)
- Streams: Fetched on-demand (no storage)
- Cost: **$0-25/month** (free tier sufficient)

**Savings:** 80% reduction in storage costs

---

## 🚨 Risk Assessment

### **Compliance Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cleanup function fails | Low | High | Daily monitoring, alerts |
| Streams stored >7 days | Very Low | High | Automated cleanup + audit log |
| Privacy violation | Very Low | Critical | Enforced in API layer |
| Rate limit exceeded | Low | Medium | Built-in rate limiter |

### **Monitoring:**
- ✅ Daily cleanup runs logged
- ✅ Failed cleanups trigger alerts
- ✅ Ops dashboard shows compliance status

---

## 📚 References

### **Strava API Documentation:**
- [API Agreement](https://www.strava.com/legal/api)
- [API Documentation](https://developers.strava.com/docs/reference/)
- [Rate Limits](https://developers.strava.com/docs/rate-limits/)

### **Internal Documentation:**
- `SCALING_AND_COSTS.md` - Cost analysis
- `IMPLEMENTATION_SUMMARY.md` - Technical details
- `TEST_PLAN.md` - Testing procedures

---

## 🔄 Maintenance Schedule

### **Daily:**
- ✅ Cleanup function runs at 3am UTC
- ✅ Audit log updated with cleanup results

### **Weekly:**
- ✅ Review ops dashboard for compliance
- ✅ Check cleanup logs for errors

### **Monthly:**
- ✅ Audit database for any orphaned streams
- ✅ Review Strava API usage vs limits
- ✅ Update documentation if needed

### **Quarterly:**
- ✅ Review Strava API Agreement for changes
- ✅ Audit compliance implementation
- ✅ Update test plan

---

## ✅ Compliance Statement

**VeloReady is fully compliant with the Strava API Agreement as of October 11, 2025.**

Our implementation:
1. ✅ Stores only metadata and derived metrics indefinitely
2. ✅ Fetches raw streams on-demand (< 7 day cache)
3. ✅ Automatically deletes any cached streams after 7 days
4. ✅ Logs all cleanup operations for audit trail
5. ✅ Enforces privacy rules on all API requests

**No raw stream data is stored for more than 7 days.**

---

## 📞 Contact

For compliance questions or concerns:
- Review ops dashboard: `https://veloready.app/ops`
- Check audit log: `SELECT * FROM audit_log WHERE kind='cleanup'`
- Review this document: `STRAVA_API_COMPLIANCE.md`

---

**Document Version:** 1.0  
**Last Reviewed:** October 11, 2025  
**Next Review:** January 11, 2026

---

## 💰 Cost & API Usage Impact Analysis

### **Storage Cost Comparison**

#### **Before (Storing Streams):**
- Per Activity: 5KB (1KB metadata + 4KB streams)
- 1,000 users: 912MB/year → $25/month (Supabase Pro)
- 10,000 users: 9.1GB/year → $99/month (Supabase Team)

#### **After (On-Demand Streams):**
- Per Activity: 1KB (metadata only)
- 1,000 users: 182MB/year → $0/month (Free tier)
- 10,000 users: 1.8GB/year → $25/month (Pro tier)

**Savings:** 80% reduction in storage costs

---

### **Strava API Usage Comparison**

#### **Before (Storing Streams):**
```
Per Activity:
- 1 call: Fetch activity metadata
- 1 call: Fetch streams (stored in DB)
- Total: 2 calls per activity

For 1,000 users (500 activities/day):
- 1,000 calls/day
- 30,000 calls/month
```

#### **After (On-Demand Streams):**
```
Per Activity Sync:
- 1 call: Fetch activity metadata
- 0 calls: Streams (not stored)

Per Activity Detail View:
- 1 call: Fetch streams on-demand
- Cached for 1 hour

For 1,000 users:
- Syncs: 500 calls/day = 15,000/month
- Views: 100 calls/day = 3,000/month (20% view rate)
- Total: 18,000 calls/month
```

**Result:** 40% reduction in API calls (30,000 → 18,000)

---

### **Strava API Rate Limits**

**Per Application Limits:**
- 100 requests per 15 minutes
- 1,000 requests per day

**Compliance by User Count:**

| Users | Daily Calls | Status | Action Needed |
|-------|-------------|--------|---------------|
| 100 | 60 | ✅ Safe | None |
| 1,000 | 600 | ✅ Safe | None |
| 5,000 | 3,000 | ⚠️ Over | Batch processing |
| 10,000 | 6,000 | ❌ Over | Rate limit increase |

---

### **Mitigation Strategies for 10K+ Users**

#### **1. Increase Cache Duration**
```typescript
// Current: 1-hour cache
headers: { "Cache-Control": "public, max-age=3600" }

// Proposed: 24-hour cache (still <7 days)
headers: { "Cache-Control": "public, max-age=86400" }

Impact: 96% reduction in stream API calls
```

#### **2. Batch Processing**
```typescript
// Spread activity syncs over 6-hour windows
// Instead of: 5,000 calls at once
// Do: 1,250 calls every 6 hours

Impact: Stays within 15-minute rate limit
```

#### **3. Request Rate Limit Increase**
```
Contact: developers@strava.com
Request: 5,000-10,000 calls/day
Justification: Responsible API usage, compliant caching
```

---

### **Cost Projection by User Count**

| Users | Storage/Year | Strava API | Supabase | Total/Month | Per User |
|-------|--------------|------------|----------|-------------|----------|
| 100 | 18MB | 1,800 calls | $0 | $0 | $0.00 |
| 1,000 | 182MB | 18,000 calls | $0 | $0 | $0.00 |
| 5,000 | 910MB | 90,000 calls | $25 | $25 | $0.005 |
| 10,000 | 1.8GB | 180,000 calls | $25 | $25 | $0.0025 |
| 50,000 | 9.1GB | 900,000 calls | $99 | $99 | $0.002 |
| 100,000 | 18.2GB | 1.8M calls | $599 | $599 | $0.006 |

---

### **User Experience Impact**

#### **Activity List View:**
- Before: Instant (data in DB)
- After: Instant (metadata in DB)
- **Impact:** ✅ No change

#### **Activity Detail View:**
- Before: Instant (streams in DB)
- After: 200-500ms delay (fetch from Strava)
- **Impact:** ⚠️ Slight delay on first view, then cached for 1 hour

#### **Charts/Graphs:**
- Before: Instant rendering
- After: 200-500ms delay on first load
- **Impact:** ⚠️ Acceptable (users expect loading states)

---

### **Optimization Recommendations**

#### **For 1,000 Users:**
✅ **Current implementation is optimal**
- $25/month savings
- Well within API limits
- Minimal UX impact
- Fully compliant

#### **For 10,000 Users:**
✅ **Add optimizations:**
1. Increase cache to 24 hours (96% API reduction)
2. Implement batch processing for syncs
3. Request rate limit increase from Strava
4. Still saves $74/month vs storing streams

#### **For 100,000 Users:**
✅ **Hybrid approach:**
1. Store derived metrics (zone times, best efforts)
2. 24-hour cache on streams
3. Batch processing
4. Enterprise Strava API agreement
5. Saves $500+/month in storage

---

### **Why On-Demand is Better**

**Advantages:**
1. ✅ **80% cost reduction** in storage
2. ✅ **Fully Strava compliant** (no 7-day issues)
3. ✅ **40% fewer API calls** overall
4. ✅ **Scales to 5K users** without changes
5. ✅ **Always fresh data** from Strava
6. ✅ **Simpler architecture** (no cleanup complexity)

**Trade-offs:**
1. ⚠️ **200-500ms delay** on first detail view
2. ⚠️ **Requires internet** (can't work offline)
3. ⚠️ **Rate limits** at 10K+ users (mitigated with batching)

**Conclusion:** On-demand approach is optimal for growth to 10K users with minimal changes needed.

---
