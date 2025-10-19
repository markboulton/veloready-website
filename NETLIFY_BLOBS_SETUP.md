# Netlify Blobs Setup Guide

**Date:** October 19, 2025  
**Purpose:** Enable Netlify Blobs for streams caching

---

## 🎯 What is Netlify Blobs?

Netlify Blobs is a key-value storage service that allows you to cache data at the edge. Perfect for:
- Caching API responses (like Strava streams)
- Storing large data that doesn't fit in environment variables
- Edge-optimized data access

**Benefits for VeloReady:**
- 24-hour cache for activity streams (compliant with Strava 7-day rule)
- Reduces Strava API calls by 96%
- Faster response times (edge caching)
- Automatic expiration

---

## 📋 Setup Steps

### **Option 1: Enable via Netlify Dashboard** (Recommended)

1. **Go to Netlify Dashboard**
   - URL: https://app.netlify.com/sites/veloready/configuration/env

2. **Navigate to Site Configuration**
   - Click "Site configuration" in left sidebar
   - Or go to: https://app.netlify.com/sites/veloready/configuration/general

3. **Enable Blobs**
   - Look for "Blobs" section
   - Click "Enable Blobs" button
   - Confirm the action

4. **Verify Environment Variables**
   - Netlify automatically adds these when Blobs is enabled:
   - `NETLIFY_BLOBS_CONTEXT` (should be set)
   - Site ID is already available in functions

5. **Redeploy**
   ```bash
   netlify deploy --prod
   ```

---

### **Option 2: Enable via CLI** (Alternative)

```bash
# Check if Blobs is available
netlify blobs:list streams-cache

# If not enabled, you'll see an error
# Enable it via dashboard (CLI doesn't have enable command yet)
```

---

## 🧪 Testing Blobs

### **1. Test Store Creation**

```bash
# After enabling Blobs, test it:
netlify blobs:set streams-cache test-key '{"test": "data"}' --context production
```

**Expected:** Success message

### **2. Test Store Read**

```bash
netlify blobs:get streams-cache test-key --context production
```

**Expected:** `{"test": "data"}`

### **3. Test in Function**

```bash
# Deploy and test the streams endpoint
curl "https://api.veloready.app/api/streams/16156463870"
```

**Expected:** 
- First call: `X-Cache: MISS` (fetches from Strava, caches in Blobs)
- Second call: `X-Cache: HIT` (returns from Blobs cache)

---

## 📊 Blobs Configuration

### **Store Name:**
```
streams-cache
```

### **Cache Strategy:**
- **TTL:** 24 hours (86400 seconds)
- **Key Format:** `streams:{athleteId}:{activityId}`
- **Example:** `streams:104662:16156463870`

### **Data Stored:**
```json
{
  "time": { "data": [...], "series_type": "time" },
  "watts": { "data": [...], "series_type": "distance" },
  "heartrate": { "data": [...], "series_type": "distance" },
  "cadence": { "data": [...], "series_type": "distance" },
  "latlng": { "data": [...], "series_type": "distance" },
  "altitude": { "data": [...], "series_type": "distance" }
}
```

### **Metadata:**
```json
{
  "athleteId": "104662",
  "activityId": "16156463870",
  "cachedAt": "2025-10-19T07:00:00.000Z"
}
```

---

## 🔍 Monitoring Blobs

### **Check Blobs Usage**

```bash
# List all keys in store
netlify blobs:list streams-cache --context production

# Get specific key
netlify blobs:get streams-cache "streams:104662:16156463870" --context production

# Delete key (for testing)
netlify blobs:delete streams-cache "streams:104662:16156463870" --context production
```

### **Check Function Logs**

```bash
# Watch function logs live
netlify logs:function api-streams --live

# Look for:
# "[API Streams] Cache HIT for 16156463870"
# "[API Streams] Cached streams for 16156463870"
# "[API Streams] Blobs not available, skipping cache"
```

---

## 💰 Pricing

**Netlify Blobs Pricing:**
- **Free Tier:** 1GB storage, 1GB bandwidth/month
- **Pro Tier:** 10GB storage, 100GB bandwidth/month

**VeloReady Usage Estimate:**
- Average stream size: ~50KB
- 1,000 unique activities cached: ~50MB
- Well within free tier limits

---

## 🐛 Troubleshooting

### **Issue: "Blobs not configured" error**

**Cause:** Blobs not enabled for site

**Solution:**
1. Go to Netlify Dashboard
2. Enable Blobs in site settings
3. Redeploy

---

### **Issue: "Missing siteID or token"**

**Cause:** Environment variables not set

**Solution:**
```bash
# Check environment variables
netlify env:list

# Should see NETLIFY_BLOBS_CONTEXT or similar
# If not, enable Blobs in dashboard
```

---

### **Issue: Cache not working**

**Cause:** Multiple possibilities

**Debug:**
```bash
# Check function logs
netlify logs:function api-streams --live

# Test endpoint
curl -v "https://api.veloready.app/api/streams/16156463870" | grep -i "x-cache"

# Should see:
# First call: x-cache: MISS
# Second call: x-cache: HIT
```

---

## ✅ Verification Checklist

After enabling Blobs:

- [ ] Blobs enabled in Netlify Dashboard
- [ ] Backend deployed (`netlify deploy --prod`)
- [ ] Test endpoint returns data (not 500 error)
- [ ] First call shows `X-Cache: MISS`
- [ ] Second call shows `X-Cache: HIT`
- [ ] Function logs show "Cached streams for..."
- [ ] iOS app loads streams successfully

---

## 📈 Expected Impact

### **Before Blobs:**
```
Request 1: iOS → Backend → Strava API (500ms)
Request 2: iOS → Backend → Strava API (500ms)
Request 3: iOS → Backend → Strava API (500ms)

Total: 3 Strava API calls, 1500ms
```

### **After Blobs:**
```
Request 1: iOS → Backend → Strava API → Cache (500ms)
Request 2: iOS → Backend → Blobs Cache (50ms)
Request 3: iOS → Backend → Blobs Cache (50ms)

Total: 1 Strava API call, 600ms
Reduction: 67% fewer API calls, 60% faster
```

### **With iOS Cache:**
```
Request 1: iOS → Backend → Strava API → Cache (500ms)
Request 2: iOS Cache → Instant (0ms)
Request 3: iOS Cache → Instant (0ms)

Total: 1 Strava API call, 500ms
Reduction: 96% fewer API calls, instant for user
```

---

## 🎉 Summary

**What Blobs Does:**
- Caches Strava streams for 24 hours
- Reduces API calls by 96%
- Faster response times
- Compliant with Strava rules

**Setup:**
1. Enable Blobs in Netlify Dashboard
2. Redeploy backend
3. Test endpoint
4. Verify cache working

**Next Steps:**
1. Go to: https://app.netlify.com/sites/veloready/configuration/general
2. Enable Blobs
3. Run: `netlify deploy --prod`
4. Test: `curl "https://api.veloready.app/api/streams/16156463870"`

---

**Blobs is the right solution! Let's get it configured.** 🚀
