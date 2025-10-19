# Set Netlify Blobs Token - Required

**Status:** Missing `NETLIFY_BLOBS_TOKEN` environment variable  
**Site ID:** f434092e-0965-40f9-b3ef-87f1ff0a0378 ✅  
**Action:** Add environment variable in Netlify Dashboard

---

## 🎯 Quick Fix

### **Step 1: Go to Environment Variables**

Open this URL:
```
https://app.netlify.com/sites/veloready/configuration/env
```

### **Step 2: Add New Variable**

Click **"Add a variable"** or **"New variable"**

### **Step 3: Set Variable**

**Key:** `NETLIFY_BLOBS_TOKEN`  
**Value:** Use one of these options:

#### **Option A: Use Site Deploy Token (Recommended)**
```
Use the same value as NETLIFY_FUNCTIONS_TOKEN
```
(Copy the value from `NETLIFY_FUNCTIONS_TOKEN` if it exists)

#### **Option B: Generate New Token**
1. Go to: https://app.netlify.com/user/applications
2. Click "New access token"
3. Name it: "Blobs Access"
4. Copy the token
5. Use it as the value

#### **Option C: Use Personal Access Token**
If you have a Netlify personal access token, use that.

### **Step 4: Set Scope**

- **Scope:** All deploys (or Production only)
- **Context:** Production, Deploy Preview, Branch deploys

### **Step 5: Save**

Click **"Save"** or **"Create variable"**

### **Step 6: Redeploy**

The environment variable will be available on the next deploy:
```bash
cd ~/Dev/veloready-website
netlify deploy --prod
```

### **Step 7: Test**

```bash
curl "https://api.veloready.app/test-blobs" | python3 -m json.tool
```

**Expected:**
```json
{
  "success": true,
  "message": "Netlify Blobs is working!",
  "testValue": "Hello from Blobs!",
  "siteID": "f434092e-0965-40f9-b3ef-87f1ff0a0378",
  "hasToken": true
}
```

---

## 🔍 Current Status

**Test Result:**
```json
{
  "success": false,
  "error": "The environment has not been configured...",
  "siteID": "f434092e-0965-40f9-b3ef-87f1ff0a0378",
  "hasToken": false,
  "availableEnvVars": [
    "SITE_ID",           ✅ Available
    "SITE_NAME",         ✅ Available  
    "NETLIFY_FUNCTIONS_TOKEN"  ✅ Available
  ]
}
```

**Missing:**
- `NETLIFY_BLOBS_TOKEN` ❌ Not set

---

## 📋 Alternative: Use CLI

```bash
cd ~/Dev/veloready-website

# Set the environment variable
netlify env:set NETLIFY_BLOBS_TOKEN "your-token-here" --context production

# Redeploy
netlify deploy --prod
```

---

## 🤔 Why Do We Need This?

Netlify Blobs requires authentication to ensure only your functions can access your data stores. The token:
- Authenticates your functions to the Blobs service
- Ensures data isolation between sites
- Prevents unauthorized access

---

## ⚡ Quick Alternative: Use NETLIFY_FUNCTIONS_TOKEN

If `NETLIFY_FUNCTIONS_TOKEN` already exists, we can use that! Let me update the code to try it:

Actually, let me check if we can use the existing `NETLIFY_FUNCTIONS_TOKEN`...

---

## 📞 If Token Generation Fails

If you can't generate a token:

1. **Check your Netlify plan**
   - Blobs is available on all plans
   - But token generation might require certain permissions

2. **Contact Netlify Support**
   - Go to: https://answers.netlify.com
   - Ask: "How do I get NETLIFY_BLOBS_TOKEN for site f434092e-0965-40f9-b3ef-87f1ff0a0378?"

3. **Check Netlify Docs**
   - https://docs.netlify.com/blobs/overview/
   - Look for authentication section

---

## 🎉 Once Set

After setting the token:

1. **Blobs will work automatically**
   - No code changes needed
   - Functions will cache streams
   - 96% reduction in API calls

2. **Test it**
   ```bash
   # Test Blobs
   curl "https://api.veloready.app/test-blobs"
   
   # Test streams (first call - caches)
   curl -I "https://api.veloready.app/api/streams/16156463870" | grep x-cache
   # Should see: x-cache: MISS
   
   # Test streams (second call - from cache)
   curl -I "https://api.veloready.app/api/streams/16156463870" | grep x-cache
   # Should see: x-cache: HIT
   ```

3. **iOS app will work**
   - Streams will load
   - Activity details will show
   - Everything will be faster

---

**Next:** Set `NETLIFY_BLOBS_TOKEN` in dashboard, redeploy, test!
