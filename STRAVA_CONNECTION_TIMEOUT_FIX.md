# Strava Connection Timeout Fix - November 11, 2025

**Status**: 🔥 **CRITICAL - COMMIT READY TO PUSH**

---

## Problem

Strava authentication is **still failing** with database connection timeouts, even after yesterday's fix:

```
ERROR [Auth] Authentication error: Error: Connection terminated due to connection timeout
at /var/task/node_modules/pg-pool/index.js:45:11
at async withDb (/var/task/netlify/functions/me-strava-token.js:13192:18)
```

**Duration**: 5802ms (hitting the 5-second timeout)

### Root Cause

The Supabase Transaction Pooler (port 6543) is **intermittently slow** and taking longer than 5 seconds to establish connections. This is causing:
1. Connection timeouts after 5 seconds
2. Failed authentication requests
3. Strava activities not loading in the iOS app

---

## Solution Implemented

### Changes Made (Commit `75fdcb7`)

1. **Increased Connection Timeout**: 5s → 10s
   - Gives more time for slow pooler connections
   - Reduces false timeout failures

2. **Increased Statement Timeout**: 10s → 15s
   - Allows queries more time to complete
   - Prevents premature query cancellation

3. **Added Retry Logic with Exponential Backoff**
   - Retries connection errors up to 2 times
   - Uses exponential backoff (100ms, 200ms)
   - Only retries on connection errors, not query errors

4. **Enhanced Diagnostic Logging**
   - Shows whether using POOLER or DIRECT connection
   - Logs connection string (with password redacted)
   - Logs retry attempts for debugging

### Code Changes

**File**: `netlify/lib/db-pooled.ts`

**Before**:
```typescript
connectionTimeoutMillis: 5000, // Wait up to 5s for connection
statement_timeout: 10000,     // 10s max per query

export async function withDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
```

**After**:
```typescript
connectionTimeoutMillis: 10000, // Wait up to 10s for connection (increased from 5s)
statement_timeout: 15000,      // 15s max per query

export async function withDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    } catch (error: any) {
      lastError = error;
      
      // Only retry on connection timeout errors
      const isConnectionError = 
        error.message?.includes('Connection terminated') ||
        error.message?.includes('connection timeout') ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET';

      if (!isConnectionError || attempt === maxRetries) {
        throw error;
      }

      console.warn(`[DB Pool] Connection error on attempt ${attempt + 1}/${maxRetries + 1}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  
  throw lastError!;
}
```

---

## How to Deploy

### Option 1: Push to GitHub (Recommended)

```bash
cd /Users/mark.boulton/Documents/dev/veloready-website
git push origin main
```

This will trigger Netlify auto-deployment (~2-3 minutes).

### Option 2: Manual Netlify Deploy

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Navigate to VeloReady Website project
3. Click **"Deploys"** tab
4. Click **"Trigger deploy"** → **"Deploy site"**
5. Wait for build to complete (~2-3 minutes)

---

## Expected Results

After deployment, you should see in Netlify logs:

```
[DB Pool] Initializing pool - Using POOLER connection: postgresql://postgres.****@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

If a connection fails, you'll see retry attempts:

```
[DB Pool] Connection error on attempt 1/3, retrying... Connection terminated due to connection timeout
[DB Pool] Connection error on attempt 2/3, retrying... Connection terminated due to connection timeout
```

On success:

```
[Auth] ✅ Authenticated user: {user_id}, athlete: {athlete_id}, tier: pro
[Strava Token] Token requested for authenticated athlete {athlete_id}
[Strava Token] Returning valid token (expires in 45min)
```

---

## Testing

After deployment:

1. **Force quit** the VeloReady iOS app (swipe up from app switcher)
2. **Relaunch** the app
3. Check that:
   - ✅ Activities load from Strava
   - ✅ No "Authentication failed" errors in logs
   - ✅ Strava connection shows as active

---

## Why This Happens

**Supabase Transaction Pooler Performance Issues**:

1. **Cold Starts**: Pooler connections can be slow on first request
2. **Network Latency**: AWS region differences (your Netlify vs Supabase)
3. **Pooler Load**: Supabase pooler might be under heavy load
4. **Connection Pool Exhaustion**: Pooler might have hit max connections

**Why Retry Logic Helps**:
- First attempt might hit a slow/busy pooler connection
- Second attempt often succeeds with a different connection
- Exponential backoff prevents hammering the pooler

---

## Alternative Solutions (If This Doesn't Work)

If connection timeouts persist after this fix:

### 1. Switch to Direct Connection (Not Recommended)
```bash
# In Netlify environment variables:
# Remove DATABASE_POOLER_URL
# Keep DATABASE_URL (direct connection, port 5432)
```
**Downside**: Direct connections are slower and don't scale well.

### 2. Use Supabase Edge Functions Instead
Migrate critical endpoints (like Strava token refresh) to Supabase Edge Functions, which have better database connectivity.

### 3. Cache Strava Tokens in Redis/Upstash
Store active Strava tokens in a fast cache to avoid database queries entirely.

### 4. Contact Supabase Support
Report persistent pooler performance issues to Supabase.

---

## Commit Details

**Commit**: `75fdcb7`  
**Message**: `fix: Increase DB timeout to 10s and add retry logic for connection failures`  
**File Changed**: `netlify/lib/db-pooled.ts`  
**Lines Changed**: +46, -10

---

## Status Checklist

- [x] Issue diagnosed (connection timeout)
- [x] Fix implemented (timeout increase + retry logic)
- [x] Commit created locally
- [ ] **Pushed to GitHub** ← YOU ARE HERE
- [ ] **Netlify deployed**
- [ ] **Tested and verified**

---

**Next Action**: Push the commit to trigger Netlify deployment.

```bash
cd /Users/mark.boulton/Documents/dev/veloready-website
git push origin main
```

