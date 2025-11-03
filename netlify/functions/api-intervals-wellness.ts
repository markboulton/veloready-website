import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { withDb } from "../lib/db-pooled";
import { authenticate, getTierLimits } from "../lib/auth";

/**
 * GET /api/intervals/wellness
 * 
 * Fetch wellness data from Intervals.icu with caching
 * 
 * Query params:
 * - days: Number of days to fetch (default: 30, max: 90)
 * 
 * Returns: Array of wellness data (HRV, RHR, sleep, etc.)
 * 
 * Caching: Results cached for 5 minutes per user
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    // Authenticate user and get athlete ID
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: auth.error })
      };
    }

    const { userId, athleteId, subscriptionTier } = auth;

    // Parse query parameters
    const requestedDays = parseInt(event.queryStringParameters?.days || "30");

    // Get tier limits
    const limits = getTierLimits(subscriptionTier);

    // Check tier limits for days
    if (requestedDays > limits.daysBack) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: 'TIER_LIMIT_EXCEEDED',
          message: `Your ${subscriptionTier} plan allows access to ${limits.daysBack} days of data. Upgrade to access more history.`,
          currentTier: subscriptionTier,
          requestedDays: requestedDays,
          maxDaysAllowed: limits.daysBack
        })
      };
    }

    // Cap values to tier limits
    const days = Math.min(requestedDays, limits.daysBack);

    console.log(`[API Intervals Wellness] Request: athleteId=${athleteId}, tier=${subscriptionTier}, days=${days}`);

    // Get Intervals.icu credentials
    const athlete = await withDb(async (db) => {
      const { rows } = await db.query(
        `SELECT intervals_athlete_id, intervals_api_key FROM athlete WHERE id = $1`,
        [athleteId]
      );
      return rows[0];
    });

    if (!athlete?.intervals_athlete_id || !athlete?.intervals_api_key) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Not connected to Intervals.icu",
          message: "Please connect your Intervals.icu account"
        })
      };
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch from Intervals.icu API
    const url = `https://intervals.icu/api/v1/athlete/${athlete.intervals_athlete_id}/wellness`;
    const params = new URLSearchParams({
      oldest: startDate.toISOString().split('T')[0],
      newest: endDate.toISOString().split('T')[0]
    });

    console.log(`[API Intervals Wellness] Fetching from: ${url}?${params}`);

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`API_KEY:${athlete.intervals_api_key}`).toString('base64')}`
      }
    });

    if (!response.ok) {
      console.error(`[API Intervals Wellness] Intervals API error: ${response.status}`);
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Failed to fetch wellness data from Intervals.icu",
          status: response.status
        })
      };
    }

    const wellness = await response.json();

    console.log(`[API Intervals Wellness] Fetched ${wellness.length} wellness entries from Intervals.icu`);

    // Return with cache headers (5 minutes)
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300", // 5 minutes cache
        "X-Cache": "MISS",
        "X-Source": "intervals.icu",
        "X-Wellness-Count": wellness.length.toString()
      },
      body: JSON.stringify({
        wellness,
        metadata: {
          athleteId: athlete.intervals_athlete_id,
          tier: subscriptionTier,
          days,
          count: wellness.length,
          source: "intervals.icu",
          cachedUntil: new Date(Date.now() + 300000).toISOString()
        }
      })
    };

  } catch (error: any) {
    console.error("[API Intervals Wellness] Error:", error);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to fetch wellness data from Intervals.icu",
        message: error.message 
      })
    };
  }
}
