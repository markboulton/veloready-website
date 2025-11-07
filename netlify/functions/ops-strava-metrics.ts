import { HandlerEvent } from "@netlify/functions";
import { Redis } from '@upstash/redis';
import { ENV } from "../lib/env";

/**
 * Operations Dashboard - Strava API Usage Metrics
 * 
 * GET /ops/strava-metrics
 * 
 * Returns real-time Strava API usage statistics to prevent rate limit issues
 * 
 * Metrics:
 * - 15-minute window usage (100 req limit)
 * - Daily usage (1000 req limit)
 * - Per-user breakdowns
 * - Alerts when approaching limits
 * 
 * Access: Internal ops only (no auth required for now)
 */

// Initialize Redis client
const redis = new Redis({
  url: ENV.REDIS_URL,
  token: ENV.REDIS_TOKEN,
});

export async function handler(event: HandlerEvent) {
  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const now = Date.now();
    
    // Calculate current windows
    const fifteenMinWindow = Math.floor(now / 900000); // 15 min in ms
    const dailyWindow = Math.floor(now / 86400000); // Day in ms
    
    // Fetch aggregate usage from Redis
    const fifteenMinKey = `rate_limit:strava:total:15min:${fifteenMinWindow}`;
    const dailyKey = `rate_limit:strava:total:daily:${dailyWindow}`;
    
    const [fifteenMinUsage, dailyUsage] = await Promise.all([
      redis.get(fifteenMinKey) || 0,
      redis.get(dailyKey) || 0
    ]);
    
    // Calculate percentages and thresholds
    const fifteenMinUsageNum = Number(fifteenMinUsage);
    const dailyUsageNum = Number(dailyUsage);
    
    const fifteenMinPercent = (fifteenMinUsageNum / 100) * 100;
    const dailyPercent = (dailyUsageNum / 1000) * 100;
    
    // Determine alert levels
    const fifteenMinAlert = getAlertLevel(fifteenMinPercent);
    const dailyAlert = getAlertLevel(dailyPercent);
    
    // Calculate reset times
    const fifteenMinResetAt = (fifteenMinWindow + 1) * 900000;
    const dailyResetAt = (dailyWindow + 1) * 86400000;
    
    // Get per-endpoint breakdown (optional, for detailed analysis)
    const endpointBreakdown = await getEndpointBreakdown();
    
    const response = {
      timestamp: new Date(now).toISOString(),
      status: getOverallStatus(fifteenMinAlert, dailyAlert),
      
      fifteenMinuteWindow: {
        used: fifteenMinUsageNum,
        limit: 100,
        remaining: Math.max(0, 100 - fifteenMinUsageNum),
        percent: Math.round(fifteenMinPercent * 100) / 100,
        alert: fifteenMinAlert,
        resetsAt: new Date(fifteenMinResetAt).toISOString(),
        resetsIn: Math.ceil((fifteenMinResetAt - now) / 1000) + "s"
      },
      
      dailyWindow: {
        used: dailyUsageNum,
        limit: 1000,
        remaining: Math.max(0, 1000 - dailyUsageNum),
        percent: Math.round(dailyPercent * 100) / 100,
        alert: dailyAlert,
        resetsAt: new Date(dailyResetAt).toISOString(),
        resetsIn: Math.ceil((dailyResetAt - now) / 1000) + "s"
      },
      
      recommendations: getRecommendations(fifteenMinPercent, dailyPercent),
      
      endpoints: endpointBreakdown
    };
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      body: JSON.stringify(response, null, 2)
    };
    
  } catch (error: any) {
    console.error("[Strava Metrics] Error:", error);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to fetch metrics",
        message: error.message
      })
    };
  }
}

/**
 * Get alert level based on usage percentage
 */
function getAlertLevel(percent: number): "ok" | "warning" | "critical" {
  if (percent >= 90) return "critical";
  if (percent >= 80) return "warning";
  return "ok";
}

/**
 * Get overall system status
 */
function getOverallStatus(fifteenMinAlert: string, dailyAlert: string): "healthy" | "degraded" | "critical" {
  if (fifteenMinAlert === "critical" || dailyAlert === "critical") return "critical";
  if (fifteenMinAlert === "warning" || dailyAlert === "warning") return "degraded";
  return "healthy";
}

/**
 * Get recommendations based on current usage
 */
function getRecommendations(fifteenMinPercent: number, dailyPercent: number): string[] {
  const recommendations: string[] = [];
  
  if (fifteenMinPercent >= 90) {
    recommendations.push("🚨 CRITICAL: 15-minute limit almost reached. Reduce API calls immediately.");
  } else if (fifteenMinPercent >= 80) {
    recommendations.push("⚠️ WARNING: Approaching 15-minute limit. Monitor closely.");
  }
  
  if (dailyPercent >= 90) {
    recommendations.push("🚨 CRITICAL: Daily limit almost reached. Consider caching optimizations.");
  } else if (dailyPercent >= 80) {
    recommendations.push("⚠️ WARNING: Approaching daily limit. Review webhook registration.");
  }
  
  if (dailyPercent >= 70) {
    recommendations.push("💡 Consider increasing cache TTLs (currently 4h for activities, 7d for streams)");
  }
  
  if (fifteenMinPercent < 50 && dailyPercent < 50) {
    recommendations.push("✅ API usage is healthy. No action needed.");
  }
  
  return recommendations;
}

/**
 * Get per-endpoint breakdown (basic implementation)
 */
async function getEndpointBreakdown(): Promise<Record<string, number>> {
  // This would require more detailed tracking in rate-limit.ts
  // For now, return a placeholder structure
  // In production, you'd track each endpoint separately
  
  return {
    "api-activities": 0, // Would fetch from Redis
    "api-streams": 0,
    "oauth-token-exchange": 0,
    "auth-refresh-token": 0
  };
}
