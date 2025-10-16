# 🚀 Deploy Dashboard Password Protection NOW

**Repository:** veloready-website  
**Time Required:** 5 minutes

---

## ✅ **Files Ready**

- ✅ `_headers` - Password protection configured
- ✅ `netlify.toml` - Redirects configured
- ✅ `DASHBOARD_AUTH_SETUP.md` - Full documentation

---

## 🎯 **3-Step Deployment**

### **Step 1: Set Password (2 min)**

1. Go to: https://app.netlify.com/sites/veloready/settings/deploys#environment

2. Add variable:
   ```
   Key:   DASHBOARD_PASSWORD
   Value: [Strong password 20+ characters]
   ```

3. Click "Save"

---

### **Step 2: Deploy (1 min)**

```bash
# You're in the right directory
cd /Users/markboulton/Dev/veloready-website

# Add files
git add _headers netlify.toml *.md

# Commit
git commit -m "Add password protection to /ops/ dashboard"

# Push (triggers Netlify deploy)
git push origin main
```

---

### **Step 3: Test (2 min)**

```bash
# Test dashboard requires password
curl https://veloready.app/ops/
# Expected: 401 Unauthorized

# Test with credentials
curl -u admin:yourpassword https://veloready.app/ops/
# Expected: 200 OK with HTML

# Test app still works
curl https://veloready.app/.well-known/apple-app-site-association
# Expected: 200 OK with JSON (no auth required)
```

---

## 🔐 **What Gets Protected**

| Path | Protected? | Why |
|------|-----------|-----|
| `/ops/*` | ✅ YES | Dashboard |
| `/dashboard/*` | ✅ YES | Dashboard |
| `/oauth/*` | ❌ NO | OAuth needs this |
| `/auth/*` | ❌ NO | OAuth needs this |
| `/api/*` | ❌ NO | App needs this |
| `/ai-brief` | ❌ NO | App needs this |
| `/ai-ride-summary` | ❌ NO | App needs this |
| `/webhooks/*` | ❌ NO | Strava needs this |
| `/.well-known/*` | ❌ NO | iOS needs this |

---

## ✅ **Verification**

After deployment:

1. **Dashboard protected:** ✅
   - Visit https://veloready.app/ops/
   - Should prompt for username/password

2. **App works:** ✅
   - Universal Links work
   - OAuth works
   - API calls work

---

## 📝 **Login**

**URL:** https://veloready.app/ops/

**Username:** `admin`

**Password:** [Your DASHBOARD_PASSWORD]

---

## 🚀 **Deploy Command**

```bash
git add -A
git commit -m "Add password protection to /ops/ dashboard"
git push origin main
```

**Don't forget to set `DASHBOARD_PASSWORD` in Netlify!** 🔐
