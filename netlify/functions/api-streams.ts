import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { getStreams } from "../lib/strava";
import { getStore } from "@netlify/blobs";
import { authenticate, getTierLimits } from "../lib/auth";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";
import { checkRateLimit } from "../lib/rate-limit";

/**
 * GET /api/streams/:activityId
 *
 * Fetch activity streams (power, HR, cadence, etc.) with multi-layer caching
 *
 * Path params:
 * - activityId: Strava activity ID
 *
 * Returns: Strava streams data
 *
 * Caching Strategy:
 * - Layer 1: HTTP Cache-Control (24 hours) - CDN/browser cache
 * - Layer 2: Netlify Blobs (persistent) - backend cache
 * - Layer 3: Strava API (on-demand)
 *
 * Compliant with Strava 7-day cache rule. iOS app can cache locally for 7 days.
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
      'api-streams'
    );

    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return {
        statusCode: 429,
        headers: {
          ...getNoCacheHeaders(),
          'X-RateLimit-Limit': getTierLimits(subscriptionTier).rateLimitPerHour.toString(),
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.resetAt.toString(),
          'Retry-After': retryAfterSeconds.toString(),
        },
        body: JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Your ${subscriptionTier} plan allows ${getTierLimits(subscriptionTier).rateLimitPerHour} requests per hour. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
          resetAt: rateLimit.resetAt,
          tier: subscriptionTier,
          timestamp: Date.now(),
        }),
      };
    }

    // Get tier limits (for logging/metadata purposes)
    const limits = getTierLimits(subscriptionTier);

    // Extract activity ID from path
    const pathParts = event.path.split('/');
    const activityId = pathParts[pathParts.length - 1];

    if (!activityId || activityId === 'api-streams') {
      return {
        statusCode: 400,
        headers: getNoCacheHeaders(),
        body: JSON.stringify({
          error: "Activity ID required",
          timestamp: Date.now()
        })
      };
    }

    console.log(`[API Streams] Request for activity: ${activityId} (athlete: ${athleteId}, tier: ${subscriptionTier})`);

    // Try Netlify Blobs cache first (24-hour TTL)
    let cached = null;
    try {
      const siteID = process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN 
        || process.env.NETLIFY_TOKEN 
        || process.env.NETLIFY_FUNCTIONS_TOKEN;
      
      console.log(`[API Streams] Cache check - siteID: ${!!siteID}, token: ${!!token}`);
      
      if (!siteID || !token) {
        throw new Error("Missing siteID or token for Blobs");
      }
      
      const store = getStore({
        name: "streams-cache",
        ...(siteID && token ? { siteID, token } : {})
      });
      const cacheKey = `streams:${athleteId}:${activityId}`;
      console.log(`[API Streams] Checking cache for key: ${cacheKey}`);
      
      cached = await store.get(cacheKey, { type: "json" });
      
      if (cached) {
        console.log(`[API Streams] ✅ Cache HIT for ${activityId}`);
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400", // 24 hours
            "Netlify-Cache-Tag": "api,streams,strava", // Cache tags for selective purging
            "X-Cache": "HIT",
            "X-RateLimit-Limit": getTierLimits(subscriptionTier).rateLimitPerHour.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toString()
          },
          body: JSON.stringify({
            ...cached,
            metadata: {
              ...(cached.metadata || {}),
              tier: subscriptionTier
            }
          })
        };
      } else {
        console.log(`[API Streams] ❌ Cache MISS for ${activityId} - no data found`);
      }
    } catch (cacheError: any) {
      // Blobs not configured or cache miss - continue without caching
      console.error(`[API Streams] ⚠️ Cache error:`, cacheError?.message || cacheError, cacheError?.stack);
    }

    // Fetch from Strava
    console.log(`[API Streams] Fetching from Strava for ${activityId}`);
    const streams = await getStreams(athleteId, parseInt(activityId));

    // Cache in Netlify Blobs (24 hours)
    let cacheStatus = "not-attempted";
    try {
      const siteID = process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN 
        || process.env.NETLIFY_TOKEN 
        || process.env.NETLIFY_FUNCTIONS_TOKEN;
      
      console.log(`[API Streams] Attempting to cache - siteID: ${!!siteID}, token: ${!!token}`);
      
      if (!siteID || !token) {
        throw new Error("Missing siteID or token for Blobs");
      }
      
      const store = getStore({
        name: "streams-cache",
        ...(siteID && token ? { siteID, token } : {})
      });
      const cacheKey = `streams:${athleteId}:${activityId}`;
      
      console.log(`[API Streams] Caching key: ${cacheKey}, data size: ${JSON.stringify(streams).length} bytes`);
      
      await store.setJSON(cacheKey, streams, {
        metadata: {
          athleteId: athleteId.toString(),
          activityId,
          cachedAt: new Date().toISOString()
        }
      });
      console.log(`[API Streams] ✅ Successfully cached streams for ${activityId}`);
      cacheStatus = "cached";
    } catch (cacheError: any) {
      // Caching failed - not critical, continue
      console.error(`[API Streams] ❌ Caching failed:`, cacheError?.message || cacheError, cacheError?.stack);
      cacheStatus = `failed: ${cacheError?.message}`;
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400", // 24 hours
        "Netlify-Cache-Tag": "api,streams,strava", // Cache tags for selective purging
        "X-Cache": "MISS",
        "X-Cache-Write": cacheStatus,
        "X-RateLimit-Limit": getTierLimits(subscriptionTier).rateLimitPerHour.toString(),
        "X-RateLimit-Remaining": rateLimit.remaining.toString(),
        "X-RateLimit-Reset": rateLimit.resetAt.toString()
      },
      body: JSON.stringify({
        ...streams,
        metadata: {
          ...(streams.metadata || {}),
          tier: subscriptionTier
        }
      })
    };

  } catch (error: any) {
    console.error("[API Streams] Error:", error);

    return {
      statusCode: 500,
      headers: getNoCacheHeaders(),
      body: JSON.stringify({
        error: "Failed to fetch streams",
        message: error.message,
        timestamp: Date.now()
      })
    };
  }
}
