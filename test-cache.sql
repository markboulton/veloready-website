-- Test query: Delete API logs older than 5 minutes to see fresh data
-- Run this in Supabase SQL Editor to clear old logs and test caching

-- Option 1: Delete all API logs (clean slate)
DELETE FROM audit_log WHERE kind = 'api';

-- Option 2: Keep only last 5 minutes (safer)
-- DELETE FROM audit_log WHERE kind = 'api' AND at < NOW() - INTERVAL '5 minutes';

-- Then check what's left
SELECT 
  note,
  COUNT(*) as count,
  MAX(at) as most_recent
FROM audit_log 
WHERE kind = 'api'
GROUP BY note
ORDER BY count DESC;
