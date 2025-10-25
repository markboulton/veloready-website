import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { withDb, getAthlete } from "../lib/db-pooled";
import { listActivitiesSince } from "../lib/strava";
import { authenticate, optionalAuth } from "../lib/auth";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";

/**
 * GET /api/activities
 * 
 * Fetch activities for authenticated user with caching
 * 
 * Query params:
 * - daysBack: Number of days to fetch (default: 30, max: 365)
 * - limit: Max activities to return (default: 50, max: 500)
 * 
 * Returns: Array of Strava activities
 * 
 * Caching: Results cached for 1 hour per user
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  // Rate limiting: 60 requests per minute per client
  const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.STANDARD);
  if (rateLimitResponse) return rateLimitResponse;

  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    // Try optional authentication (supports both authenticated and legacy hardcoded athlete)
    const auth = await optionalAuth(event);
    
    // If no auth header, fall back to hardcoded athlete ID (TEMPORARY - for iOS app compatibility)
    const athleteId = auth?.athleteId || 104662;
    const userId = auth?.userId || null;
    
    if (!auth) {
      console.log(`[API Activities] ⚠️ Using hardcoded athlete ID (no auth header) - athleteId=${athleteId}`);
    }
    
    // Parse query parameters
    const daysBack = Math.min(
      parseInt(event.queryStringParameters?.daysBack || "30"),
      365 // Cap at 365 days (1 year of history)
    );
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || "50"),
      500 // Increased from 200 to support historical ride charts
    );

    console.log(`[API Activities] Request: athleteId=${athleteId}, daysBack=${daysBack}, limit=${limit}`);

    // Calculate timestamp for "after" parameter
    const afterTimestamp = Math.floor(Date.now() / 1000) - (daysBack * 24 * 3600);

    // Fetch from Strava with pagination support
    // Strava API max per_page is 200, so we need multiple requests for limit > 200
    let allActivities: any[] = [];
    let page = 1;
    const perPage = Math.min(limit, 200); // Strava max per page
    
    while (allActivities.length < limit) {
      const pageActivities = await listActivitiesSince(athleteId, afterTimestamp, page, perPage);
      
      if (pageActivities.length === 0) {
        // No more activities available
        break;
      }
      
      allActivities = allActivities.concat(pageActivities);
      
      // If we got fewer than perPage, we've reached the end
      if (pageActivities.length < perPage) {
        break;
      }
      
      // If we've collected enough, stop
      if (allActivities.length >= limit) {
        allActivities = allActivities.slice(0, limit);
        break;
      }
      
      page++;
    }

    console.log(`[API Activities] Fetched ${allActivities.length} activities from Strava (${page} pages)`);

    // Return with cache headers (1 hour for better scaling)
    // Predictive pre-fetching: include URLs for top 3 most recent activities
    const prefetchUrls = allActivities.slice(0, 3).map(a => `/api/streams/${a.id}`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=3600", // 1 hour cache (user-specific)
        "X-Cache": "MISS", // Indicates this was fetched from Strava
        "X-Activity-Count": allActivities.length.toString()
      },
      body: JSON.stringify({
        activities: allActivities,
        prefetchUrls, // iOS app can prefetch these in background
        metadata: {
          athleteId,
          daysBack,
          limit,
          count: allActivities.length,
          cachedUntil: new Date(Date.now() + 3600000).toISOString()
        }
      })
    };

  } catch (error: any) {
    console.error("[API Activities] Error:", error);
    
    // Handle specific errors
    if (error.message?.includes("not found")) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Athlete not found" })
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to fetch activities",
        message: error.message 
      })
    };
  }
}
