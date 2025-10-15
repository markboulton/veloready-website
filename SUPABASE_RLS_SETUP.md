# Supabase RLS Setup Guide

This guide walks you through enabling Row Level Security (RLS) on your VeloReady backend to fix the Supabase security warnings.

## 🎯 What This Fixes

The following security warnings will be resolved:
- ✅ `public.athlete` - RLS not enabled
- ✅ `public.sync_state` - RLS not enabled  
- ✅ `public.activity_stream` - RLS not enabled
- ✅ `public.activity` - RLS not enabled
- ✅ `public.audit_log` - RLS not enabled

## 📋 Prerequisites

- Supabase project with existing tables
- Access to Supabase Dashboard
- Access to Netlify deployment settings

## 🚀 Deployment Steps

### Step 1: Add Environment Variables to Netlify

1. Go to your Netlify dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Add these two variables:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Where to find these:**
- **SUPABASE_URL**: Supabase Dashboard → Settings → API → Project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Supabase Dashboard → Settings → API → Service Role Key (⚠️ Keep this secret!)

### Step 2: Deploy Updated Backend

```bash
cd /Users/markboulton/Dev/veloready-website

# Commit changes
git add .
git commit -m "Add Supabase Auth integration for RLS"

# Deploy to Netlify
git push origin main
```

Or deploy manually:
```bash
netlify deploy --prod
```

### Step 3: Run SQL Migration

1. Open your **Supabase Dashboard**
2. Go to **SQL Editor**
3. Copy the contents of `supabase-rls-migration.sql`
4. Paste into the SQL Editor
5. Click **Run**

This will:
- Add `user_id` columns to all tables
- Create indexes for performance
- Enable RLS on all tables
- Create policies to restrict access to own data

### Step 4: Clean Up Existing Data (Optional)

If you have test data without `user_id`, you have two options:

**Option A: Delete test data** (recommended for testing)
```sql
DELETE FROM public.activity_stream;
DELETE FROM public.activity;
DELETE FROM public.sync_state;
DELETE FROM public.athlete;
DELETE FROM public.audit_log;
```

**Option B: Keep existing data**
- Leave it as-is
- It will be inaccessible via API (RLS blocks it)
- New OAuth flows will create proper linked data

### Step 5: Test the OAuth Flow

1. **In your iOS app**, disconnect and reconnect Strava:
   - Settings → Disconnect Strava
   - Settings → Connect to Strava
   
2. **Check Netlify logs** for:
   ```
   [Strava Token Exchange] Creating/signing in Supabase user for strava-12345@veloready.app
   [Strava Token Exchange] Created new user: a1b2c3d4-...
   [Strava Token Exchange] Credentials stored for athlete 12345 with user_id a1b2c3d4-...
   ```

3. **Verify in Supabase Dashboard**:
   - **Authentication** → **Users** - Should see new user created
   - **Table Editor** → **athlete** - Should see `user_id` populated

## 🔒 How It Works

### Before (Insecure)
```
User A authenticates → Gets athlete data
User B authenticates → Can see User A's data ❌
```

### After (Secure with RLS)
```
User A authenticates → Creates Supabase user → Gets user_id
User B authenticates → Creates different Supabase user → Gets different user_id

User A queries activities → RLS filters to only user_id = A ✅
User B queries activities → RLS filters to only user_id = B ✅
```

### OAuth Flow

1. **User clicks "Connect Strava"** in iOS app
2. **Strava OAuth completes** → Backend receives code
3. **Backend exchanges code** for Strava tokens
4. **Backend creates/signs in Supabase user**:
   - Email: `strava-{athlete_id}@veloready.app`
   - Password: Deterministic hash
   - Metadata: Strava athlete ID
5. **Backend stores athlete data** with `user_id` link
6. **RLS automatically enforces** user can only access their own data

## 🧪 Verification

### Check RLS is Enabled
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('athlete', 'activity', 'activity_stream', 'sync_state', 'audit_log');
```

Expected: All should show `rowsecurity = true`

### Check Policies Exist
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Expected: Should see policies for SELECT, INSERT, UPDATE, DELETE on each table

### Check User Data Linkage
```sql
SELECT 
  a.id as athlete_id,
  a.user_id,
  u.email,
  COUNT(act.id) as activity_count
FROM public.athlete a
LEFT JOIN auth.users u ON u.id = a.user_id
LEFT JOIN public.activity act ON act.user_id = a.user_id
GROUP BY a.id, a.user_id, u.email;
```

Expected: Each athlete should have a `user_id` and matching email

## 🐛 Troubleshooting

### "No user created" in logs
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Netlify
- Verify the service role key is correct (not the anon key)

### "Failed to create user: User already registered"
- This is normal! The code handles this by signing in instead
- Check logs show "Signed in existing user"

### "Permission denied" errors
- RLS is working! User is trying to access data they don't own
- Check the `user_id` matches between auth and data tables

### Existing data not visible
- Expected if data has `user_id = NULL`
- Either delete old data or manually link it (not recommended)

## 📊 Impact on Your System

### Security ✅
- **Before**: Any user could access any athlete's data
- **After**: Users can only access their own data

### Performance ⚡
- Minimal impact - indexes added on `user_id` columns
- RLS policies use efficient `auth.uid()` function

### Scalability 📈
- Fully scalable - each user is isolated
- No changes needed as user base grows

## 🔄 Rollback Plan

If something goes wrong:

1. **Disable RLS temporarily**:
```sql
ALTER TABLE public.athlete DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_stream DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log DISABLE ROW LEVEL SECURITY;
```

2. **Revert backend code**:
```bash
git revert HEAD
git push origin main
```

3. **Remove environment variables** from Netlify

⚠️ **Warning**: Disabling RLS leaves your data exposed. Only do this temporarily for debugging.

## ✅ Success Criteria

- [ ] No security warnings in Supabase Dashboard
- [ ] OAuth flow creates Supabase users automatically
- [ ] New athlete records have `user_id` populated
- [ ] Users can only see their own activities
- [ ] No errors in Netlify function logs

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Auth with OAuth](https://supabase.com/docs/guides/auth/social-login)

---

**Need help?** Check the Netlify function logs and Supabase logs for detailed error messages.
