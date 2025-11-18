# Strava Authentication Fix - Database Connection Timeout

**Date**: November 10, 2025  
**Status**: 🔥 **CRITICAL FIX READY** - Push commit `b47569e` to fix

---

## Problem

Strava authentication is failing with a **database connection timeout**:

```
❌ [Performance] ❌ [Strava API] Token endpoint returned 500
🔍 [Performance] 📄 Error body: {"error":"Authentication failed"}
```

### Root Cause (UPDATED)

**The real issue**: `auth.ts` was using `withDb()` instead of `withDbPooled()`.

**Backend logs showed**:
```
ERROR [Auth] Authentication error: Error: Connection terminated due to connection timeout
at /var/task/node_modules/pg-pool/index.js:45:11
```

The `withDb()` function creates a **new database connection** for each request, which is too slow for serverless functions and causes timeouts. The fix changes it to use `withDbPooled()` which uses connection pooling.

---

## Solution

### Option 1: Manual Netlify Deployment (Recommended)

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Navigate to the VeloReady Website project
3. Click "Deploys" tab
4. Click "Trigger deploy" → "Deploy site"
5. Wait for build to complete (~2-3 minutes)
6. Test the app again

### Option 2: Push via Git

A commit has been prepared in the local repository:

```bash
cd /Users/mark.boulton/Documents/dev/veloready-website
git push origin main
```

**Note**: This requires GitHub credentials to be configured.

---

## Verification

After deployment, test by:

1. Launch the VeloReady iOS app
2. Check that Strava activities load successfully
3. Verify logs show:
   ```
   ✅ [Strava] Fetched X activities
   ```
   Instead of:
   ```
   ❌ [Strava] Failed to fetch activities: notAuthenticated
   ```

---

## Technical Details

### What Changed

**Commit `b47569e`** - Fixed database connection timeout:

**Before (BROKEN - causing timeouts)**:
```typescript
import { withDb } from "./db-pooled";  // WRONG! This is the non-pooled version

const [athlete, subscription] = await Promise.all([
  withDb(async (db) => {  // Creates new connection - TOO SLOW!
    const { rows } = await db.query(
      `SELECT id FROM athlete WHERE user_id = $1`,
      [user.id]
    );
    return rows[0] || null;
  }),
]);
```

**After (FIXED - uses connection pooling)**:
```typescript
import { withDbPooled } from "./db-pooled";  // CORRECT!

const [athlete, subscription] = await Promise.all([
  withDbPooled(async (db) => {  // Uses connection pool - FAST!
    const { rows } = await db.query(
      `SELECT id FROM athlete WHERE user_id = $1`,
      [user.id]
    );
    return rows[0] || null;
  }),
]);
```

### Why Netlify Didn't Auto-Deploy

Netlify functions are **NOT automatically rebuilt** when only `lib/` files change, because they're imported modules. The function file itself (`me-strava-token.ts`) needs to be touched to trigger a rebuild.

The commit `6b7375d` adds a documentation comment to `me-strava-token.ts` to force the rebuild, but needs to be pushed to trigger the Netlify deploy.

---

## Files Modified

- ✅ `netlify/lib/auth.ts` - **Database connection fix** in commit `b47569e` (ready to push)
  - Changed `withDb` to `withDbPooled` for connection pooling
  - Prevents "Connection terminated due to connection timeout" errors

---

## Next Steps

1. **Push the commit** (requires GitHub credentials):
   ```bash
   cd /Users/mark.boulton/Documents/dev/veloready-website
   git push origin main
   ```
   
2. **OR manually trigger Netlify deploy** via dashboard

3. **Wait ~2 minutes** for build to complete

4. **Test the app** - Strava activities should load successfully

---

## Status

- [x] Issue diagnosed
- [x] Fix implemented in code
- [x] Commit prepared locally
- [ ] **Pushed to GitHub** ← YOU ARE HERE
- [ ] **Netlify deployed**
- [ ] **Tested and verified**

---

**Estimated Time to Fix**: 5 minutes (just need to push and wait for deploy)

