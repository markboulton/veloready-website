# Quick Start Guide - Strava OAuth Enhancements

## 🚀 Deploy & Test in 5 Minutes

### 1. Deploy to Netlify
```bash
cd /Users/markboulton/Dev/veloready.app
git add .
git commit -m "feat: add deauth, streams API, and ops dashboard"
git push origin main
```

### 2. Test Endpoints

#### Test Disconnect (User-Initiated)
```bash
curl "https://veloready.app/api/me/strava/disconnect?strava_athlete_id=104662"
```

#### Test Streams API
```bash
curl "https://veloready.app/api/request-streams?activity_id=12345&athlete_id=104662&keys=time,distance,altitude,heartrate,watts"
```

#### Test Metrics API
```bash
curl https://veloready.app/ops/metrics.json | jq
```

#### Test Dashboard
```bash
open https://veloready.app/ops
```

### 3. Verify in Database
```bash
# Check audit log
psql $DATABASE_URL -c "SELECT * FROM audit_log WHERE kind='deauth' ORDER BY created_at DESC LIMIT 5;"

# Check athletes
psql $DATABASE_URL -c "SELECT id, expires_at > now() as token_valid FROM athlete LIMIT 5;"

# Check activities
psql $DATABASE_URL -c "SELECT id, private, visibility FROM activity LIMIT 5;"
```

---

## 📋 New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/me/strava/disconnect` | GET | User disconnects Strava |
| `/api/request-streams` | GET | Fetch activity streams with privacy |
| `/ops/metrics.json` | GET | System metrics JSON |
| `/ops` | GET | Operations dashboard UI |

---

## 🔍 Quick Debugging

### Check Function Logs
```bash
netlify logs --function=api-request-streams
netlify logs --function=ops-metrics
netlify logs --function=webhooks-strava
netlify logs --function=me-strava-disconnect
```

### Check Database
```bash
# Recent deauths
psql $DATABASE_URL -c "SELECT * FROM audit_log WHERE kind='deauth' ORDER BY created_at DESC LIMIT 10;"

# Token status
psql $DATABASE_URL -c "SELECT count(*) filter (where expires_at > now()) as valid, count(*) filter (where expires_at < now()) as expired FROM athlete;"

# Activity privacy
psql $DATABASE_URL -c "SELECT visibility, count(*) FROM activity GROUP BY visibility;"
```

---

## ⚡ Common Issues

### Issue: "missing strava_athlete_id"
**Solution:** Add query parameter: `?strava_athlete_id=104662`

### Issue: "activity is private" (403)
**Solution:** Ensure `athlete_id` matches activity owner

### Issue: "athlete not authenticated" (401)
**Solution:** Athlete needs valid access token in DB

### Issue: Dashboard shows "Error loading metrics"
**Solution:** Check `/ops/metrics.json` endpoint directly

---

## 📊 Monitor After Deployment

1. **Check dashboard:** https://veloready.app/ops
2. **Watch for deauths:** Should see entries in audit log
3. **Test privacy:** Try accessing private activity with wrong athlete
4. **Check performance:** Streams API should respond <1s

---

## 🎯 Success Checklist

- [ ] All endpoints return 200 OK for valid requests
- [ ] Disconnect removes athlete from DB
- [ ] Audit log captures deauth events
- [ ] Streams API enforces privacy
- [ ] Dashboard displays metrics correctly
- [ ] No errors in function logs

---

## 📚 Full Documentation

- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Test Plan:** `TEST_PLAN.md`
- **This Guide:** `QUICK_START.md`

---

**Ready to deploy!** 🚀
