# 🔐 Dashboard Password Protection Setup

**Repository:** veloready-website  
**Status:** ✅ Ready to deploy

---

## ✅ **Files Updated**

1. **`_headers`** - Added password protection for `/ops/*` and `/dashboard/*`
2. **`netlify.toml`** - Added `/ops/*` redirect to `/dashboard/*`

---

## 🎯 **What This Does**

### **Protected Paths (Password Required):**
- 🔐 `/ops` → redirects to `/dashboard/index.html` (requires auth)
- 🔐 `/ops/*` → redirects to `/dashboard/*` (requires auth)
- 🔐 `/dashboard/*` → direct access (requires auth)

### **Public Paths (No Password):**
- ✅ `/.well-known/*` - Universal Links
- ✅ `/oauth/*` - OAuth callbacks
- ✅ `/auth/*` - OAuth callbacks (alternative)
- ✅ `/api/*` - API endpoints
- ✅ `/ai-brief` - AI Brief endpoint
- ✅ `/ai-ride-summary` - Ride Summary endpoint
- ✅ `/webhooks/*` - Webhook endpoints

---

## 🚀 **Deployment Steps**

### **Step 1: Set Environment Variable (2 min)**

1. **Go to Netlify Dashboard:**
   ```
   https://app.netlify.com/sites/veloready/settings/deploys#environment
   ```

2. **Add variable:**
   ```
   Key:   DASHBOARD_PASSWORD
   Value: [Choose a strong password 20+ characters]
   ```
   
   **Example:** `Vr!D@sh2025$ecure#Ops`

3. **Click "Save"**

---

### **Step 2: Deploy (1 min)**

```bash
# Navigate to website repo
cd /Users/markboulton/Dev/veloready-website

# Check changes
git status

# Add files
git add _headers netlify.toml DASHBOARD_AUTH_SETUP.md

# Commit
git commit -m "Add password protection to /ops/ dashboard"

# Push
git push origin main
```

---

### **Step 3: Test (5 min)**

#### **Test 1: Dashboard requires password**
```bash
# Should return 401 Unauthorized
curl https://veloready.app/ops/

# With credentials (replace with your password)
curl -u admin:YourPassword https://veloready.app/ops/
# Should return 200 OK with HTML
```

#### **Test 2: App functionality still works**
```bash
# Universal Links - should work WITHOUT auth
curl https://veloready.app/.well-known/apple-app-site-association
# Expected: 200 OK with JSON

# OAuth - should work WITHOUT auth
curl https://veloready.app/oauth/strava/callback
curl https://veloready.app/auth/strava/callback
# Expected: 200 OK (no auth required)

# API - should work WITHOUT auth
curl https://veloready.app/api/me/strava/status
# Expected: 200 or appropriate error (NOT 401)

# AI - should work WITHOUT auth
curl https://veloready.app/ai-brief
curl https://veloready.app/ai-ride-summary
# Expected: 200 or appropriate error (NOT 401)
```

---

## 🔍 **How It Works**

### **Request Flow:**

```
User visits: https://veloready.app/ops/
              ↓
netlify.toml redirects: /ops/ → /dashboard/index.html
              ↓
_headers checks: Is this /ops/* or /dashboard/*? YES
              ↓
Requires: Basic-Auth with admin:${DASHBOARD_PASSWORD}
              ↓
User enters credentials
              ↓
Dashboard loads ✅
```

### **Public Endpoint Flow:**

```
App makes request: https://veloready.app/api/me/strava/status
              ↓
_headers checks: Is this /ops/* or /dashboard/*? NO
              ↓
_headers checks: Is this /api/*? YES
              ↓
Applies: Public headers (no auth)
              ↓
Request succeeds ✅
```

---

## 📊 **Endpoint Coverage**

| Endpoint | Protected? | Used By | Status |
|----------|-----------|---------|--------|
| `/ops/*` | ✅ YES | Dashboard | 🔐 Auth required |
| `/dashboard/*` | ✅ YES | Dashboard | 🔐 Auth required |
| `/.well-known/*` | ❌ NO | iOS app | ✅ Public |
| `/oauth/*` | ❌ NO | OAuth | ✅ Public |
| `/auth/*` | ❌ NO | OAuth | ✅ Public |
| `/api/*` | ❌ NO | API | ✅ Public |
| `/ai-brief` | ❌ NO | AI | ✅ Public |
| `/ai-ride-summary` | ❌ NO | AI | ✅ Public |
| `/webhooks/*` | ❌ NO | Webhooks | ✅ Public |

---

## 🔒 **Security Features**

### **Dashboard Protection:**
- ✅ Basic Authentication (username + password)
- ✅ Password stored in environment variable (not in code)
- ✅ Not indexed by search engines (`X-Robots-Tag: noindex`)
- ✅ Clickjacking protection (`X-Frame-Options: DENY`)
- ✅ MIME sniffing protection (`X-Content-Type-Options: nosniff`)
- ✅ No caching of sensitive data

### **App Functionality:**
- ✅ All critical paths remain public
- ✅ No authentication required for app features
- ✅ CORS headers properly configured

---

## 🧪 **Test Checklist**

After deployment, verify:

- [ ] Dashboard at `/ops/` requires password
- [ ] Dashboard at `/dashboard/` requires password
- [ ] Correct credentials grant access
- [ ] Wrong credentials are rejected
- [ ] Universal Links work without auth
- [ ] OAuth callbacks work without auth
- [ ] API endpoints work without auth
- [ ] AI endpoints work without auth
- [ ] Webhooks work without auth

---

## 📞 **Login Credentials**

**Dashboard URL:** https://veloready.app/ops/

**Username:** `admin`

**Password:** [Set in Netlify env vars: `DASHBOARD_PASSWORD`]

---

## 🛠️ **Troubleshooting**

### **Issue: "401 Unauthorized" even with correct password**

**Solution:**
1. Check environment variable is set in Netlify
2. Redeploy the site (env vars need a redeploy)
3. Clear browser cache

### **Issue: "App functionality broken"**

**Solution:**
1. Check that public paths in `_headers` are correct
2. Test each endpoint individually with curl
3. Review Netlify function logs

### **Issue: "Dashboard not found"**

**Solution:**
1. Verify `/dashboard/index.html` exists
2. Check redirect in `netlify.toml` is correct
3. Review Netlify deploy logs

---

## ✅ **Deployment Checklist**

Before deploying:

- [x] Updated `_headers` in veloready-website repo
- [x] Updated `netlify.toml` in veloready-website repo
- [x] Removed incorrect files from VeloReady iOS repo
- [ ] Set `DASHBOARD_PASSWORD` in Netlify
- [ ] Commit and push changes
- [ ] Wait for deployment
- [ ] Run test commands
- [ ] Verify dashboard requires password
- [ ] Verify app still works

---

## 🎯 **Ready to Deploy**

```bash
cd /Users/markboulton/Dev/veloready-website
git add _headers netlify.toml DASHBOARD_AUTH_SETUP.md
git commit -m "Add password protection to /ops/ dashboard"
git push origin main
```

**Then set `DASHBOARD_PASSWORD` in Netlify!** 🔐

---

## 📝 **Notes**

- Dashboard is at `/dashboard/index.html` in the repo
- `/ops/` is just a friendly URL that redirects to `/dashboard/`
- Both paths require the same authentication
- All app functionality remains public and working
