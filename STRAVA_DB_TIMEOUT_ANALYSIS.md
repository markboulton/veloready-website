# Strava Database Timeout - Root Cause Analysis

**Date**: November 10, 2025  
**Status**: 🔍 Investigating database timeout issue

---

## The Error

```
ERROR [Auth] Authentication error: Error: Connection terminated due to connection timeout
at /var/task/node_modules/pg-pool/index.js:45:11
```

---

## Key Finding

The code was ALREADY using `withDb` from `db-pooled.ts` (the pooled version):

```typescript
import { withDb } from "./db-pooled";  // ✅ This IS the pooled version!
```

So the timeout is NOT caused by using the wrong import.

---

## Possible Causes

### 1. Database Connection String Issue
- Missing `DATABASE_POOLER_URL` environment variable
- Using direct connection instead of Supabase Transaction Pooler
- Connection string pointing to wrong database

### 2. Pool Exhausted
- All 10 connections in use
- Functions not releasing connections properly
- High concurrent load

### 3. Network/Firewall Issue
- Netlify can't reach Supabase database
- Timeout before connection established
- SSL handshake failing

### 4. Database Performance
- Query taking too long (> 2s timeout)
- Database under heavy load
- Slow query on `athlete` table lookup

---

## Next Steps to Debug

### Check Environment Variables in Netlify

Go to Netlify Dashboard → Site settings → Environment variables and verify:

1. **DATABASE_POOLER_URL** - Should be set to Supabase **Transaction Pooler** (port `6543`)
   - Format: `postgresql://postgres.xxxxx:6543/postgres`
   - **NOT** the direct connection URL (port `5432`)

2. **DATABASE_URL** - Fallback connection string
   - Should also work, but slower than pooler

### Check Pool Settings

In `db-pooled.ts`:
```typescript
max: 10,                      // Max connections
connectionTimeoutMillis: 2000, // 2s timeout - might be too short!
statement_timeout: 10000,      // 10s per query
```

**Potential fix**: Increase `connectionTimeoutMillis` to 5000ms (5 seconds)

### Check Database Performance

The query being run:
```sql
SELECT id FROM athlete WHERE user_id = $1
```

- Is there an index on `athlete.user_id`?
- Is the database responding slowly?

---

## Recommended Fixes (in priority order)

### Fix #1: Verify DATABASE_POOLER_URL is set ⭐

**Most likely cause**: Not using Supabase Transaction Pooler

1. Go to Supabase Dashboard → Settings → Database
2. Copy "Transaction Pooler" connection string (port 6543)
3. Add as `DATABASE_POOLER_URL` in Netlify environment variables
4. Redeploy

### Fix #2: Increase connection timeout

Edit `db-pooled.ts`:
```typescript
connectionTimeoutMillis: 5000, // Increase from 2000 to 5000
```

### Fix #3: Add database index

```sql
CREATE INDEX IF NOT EXISTS idx_athlete_user_id ON athlete(user_id);
```

---

## Testing After Fix

After deploying fix, check Netlify logs for:

**SUCCESS**:
```
[Auth] ✅ Authenticated user: [uuid], athlete: 104662, tier: pro
[Strava Token] Token requested for authenticated athlete 104662
```

**STILL FAILING**:
```
ERROR [Auth] Authentication error: Error: Connection terminated due to connection timeout
```

---

## Current Status

- ✅ Code is using pooled connections correctly
- ❌ Database connection timing out
- 🔍 Need to check Netlify environment variables
- 🔍 May need to increase timeout or use Transaction Pooler

---

**Next Action**: Check if `DATABASE_POOLER_URL` is set in Netlify Dashboard

