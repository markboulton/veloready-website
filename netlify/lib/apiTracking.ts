import { incrby, get, setex } from "./redis";

/**
 * API Call Tracking for Strava Rate Limit Monitoring
 * 
 * Tracks daily API calls to Strava to prevent hitting rate limits
 * - Daily limit: 1,000 calls/day
 * - 15-minute limit: 100 calls/15min
 */

const DAILY_KEY = "api:strava:daily";
const WINDOW_KEY_PREFIX = "api:strava:15min";

/**
 * Increment API call counter for rate limit tracking
 * @param endpoint - The Strava API endpoint being called (for breakdown)
 */
export async function trackStravaAPICall(endpoint: string = "unknown") {
  try {
    // Increment daily counter (resets at midnight UTC)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dailyKey = `${DAILY_KEY}:${today}`;
    await incrby(dailyKey, 1);
    
    // Set expiry to 48 hours (in case tracking starts late in day)
    await setex(dailyKey, 48 * 3600, "1");
    
    // Increment 15-minute window counter
    const now = new Date();
    const windowStart = new Date(now.getTime() - (now.getMinutes() % 15) * 60 * 1000);
    const windowKey = `${WINDOW_KEY_PREFIX}:${windowStart.toISOString()}`;
    await incrby(windowKey, 1);
    
    // Set expiry to 1 hour for 15-min windows
    await setex(windowKey, 3600, "1");
    
    // Track endpoint breakdown
    const endpointKey = `api:strava:endpoint:${today}:${endpoint}`;
    await incrby(endpointKey, 1);
    await setex(endpointKey, 48 * 3600, "1");
    
    console.log(`[API Tracking] Strava API call tracked: ${endpoint}`);
  } catch (error) {
    console.error("[API Tracking] Failed to track API call:", error);
    // Don't throw - tracking failure shouldn't break the API call
  }
}

/**
 * Get current API usage stats
 */
export async function getAPIUsage() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `${DAILY_KEY}:${today}`;
    
    const dailyCount = await get(dailyKey);
    
    // Get current 15-minute window
    const now = new Date();
    const windowStart = new Date(now.getTime() - (now.getMinutes() % 15) * 60 * 1000);
    const windowKey = `${WINDOW_KEY_PREFIX}:${windowStart.toISOString()}`;
    const windowCount = await get(windowKey);
    
    return {
      daily: {
        count: parseInt(dailyCount || "0"),
        limit: 1000,
        percentage: Math.round((parseInt(dailyCount || "0") / 1000) * 100),
        remaining: 1000 - parseInt(dailyCount || "0")
      },
      fifteenMin: {
        count: parseInt(windowCount || "0"),
        limit: 100,
        percentage: Math.round((parseInt(windowCount || "0") / 100) * 100),
        remaining: 100 - parseInt(windowCount || "0"),
        windowStart: windowStart.toISOString()
      },
      alerts: {
        daily_warning: parseInt(dailyCount || "0") >= 800, // 80% of limit
        daily_critical: parseInt(dailyCount || "0") >= 950, // 95% of limit
        fifteenMin_warning: parseInt(windowCount || "0") >= 80,
        fifteenMin_critical: parseInt(windowCount || "0") >= 95
      }
    };
  } catch (error) {
    console.error("[API Tracking] Failed to get API usage:", error);
    return null;
  }
}

/**
 * Get breakdown by endpoint for today
 */
export async function getEndpointBreakdown() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Known endpoints to check
    const endpoints = ["streams", "activities", "athlete", "activity"];
    const breakdown: Record<string, number> = {};
    
    for (const endpoint of endpoints) {
      const key = `api:strava:endpoint:${today}:${endpoint}`;
      const count = await get(key);
      if (count) {
        breakdown[endpoint] = parseInt(count);
      }
    }
    
    return breakdown;
  } catch (error) {
    console.error("[API Tracking] Failed to get endpoint breakdown:", error);
    return {};
  }
}
