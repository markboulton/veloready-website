import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { withDb, getAthlete } from "../lib/db-pooled";
import { listActivitiesSince } from "../lib/strava";
import { authenticate, getTierLimits } from "../lib/auth";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";
import { checkRateLimit } from "../lib/rate-limit";

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

/**
 * Helper function to generate no-cache headers that prevent Netlify CDN caching
 */
function getNoCacheHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'CDN-Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
    'Netlify-Vary': 'query',
  };
}
export async function handler(event: HandlerEvent, context: HandlerContext) {
  // Rate limiting: 60 requests per minute per client
  const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.STANDARD);
  if (rateLimitResponse) return rateLimitResponse;

  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: getNoCacheHeaders(),
      body: JSON.stringify({
        error: "Method not allowed",
        timestamp: Date.now()
      })
    };
  }

  try {
    // Authenticate user and get athlete ID
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: getNoCacheHeaders(),
        body: JSON.stringify({
          error: auth.error,
          timestamp: Date.now()
        })
      };
    }

    const { userId, athleteId, subscriptionTier } = auth;

    // Check tier-based rate limit BEFORE processing request
    const rateLimit = await checkRateLimit(
      userId,
      athleteId.toString(),
      subscriptionTier,
      'api-activities'
    );

    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: {
          ...getNoCacheHeaders(),
          'X-RateLimit-Limit': getTierLimits(subscriptionTier).rateLimitPerHour.toString(),
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.resetAt.toString(),
        },
        body: JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Your ${subscriptionTier} plan allows ${getTierLimits(subscriptionTier).rateLimitPerHour} requests per hour. Please try again later.`,
          resetAt: rateLimit.resetAt,
          tier: subscriptionTier,
          timestamp: Date.now(),
        }),
      };
    }

    // Parse query parameters
    const requestedDays = parseInt(event.queryStringParameters?.daysBack || "30");
    const requestedLimit = parseInt(event.queryStringParameters?.limit || "50");

    // Get tier limits
    const limits = getTierLimits(subscriptionTier);

    // Check tier limits for daysBack
    if (requestedDays > limits.daysBack) {
      return {
        statusCode: 403,
        headers: getNoCacheHeaders(),
        body: JSON.stringify({
          error: 'TIER_LIMIT_EXCEEDED',
          message: `Your ${subscriptionTier} plan allows access to ${limits.daysBack} days of data. Upgrade to access more history.`,
          currentTier: subscriptionTier,
          requestedDays: requestedDays,
          maxDaysAllowed: limits.daysBack,
          timestamp: Date.now()
        })
      };
    }

    // Cap values to tier limits
    const daysBack = Math.min(requestedDays, limits.daysBack);
    const limit = Math.min(requestedLimit, limits.maxActivities);

    console.log(`[API Activities] Request: athleteId=${athleteId}, tier=${subscriptionTier}, daysBack=${daysBack}, limit=${limit}`);

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
        "Netlify-Cache-Tag": "api,activities,strava", // Cache tags for selective purging
        "X-Cache": "MISS", // Indicates this was fetched from Strava
        "X-Activity-Count": allActivities.length.toString()
      },
      body: JSON.stringify({
        activities: allActivities,
        prefetchUrls, // iOS app can prefetch these in background
        metadata: {
          athleteId: Number(athleteId), // Ensure it's a number, not string
          tier: subscriptionTier,
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
        headers: getNoCacheHeaders(),
        body: JSON.stringify({
          error: "Athlete not found",
          timestamp: Date.now()
        })
      };
    }

    return {
      statusCode: 500,
      headers: getNoCacheHeaders(),
      body: JSON.stringify({
        error: "Failed to fetch activities",
        message: error.message,
        timestamp: Date.now()
      })
    };
  }
}
