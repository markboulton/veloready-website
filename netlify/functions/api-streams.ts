import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { getStreams } from "../lib/strava";
import { getStore } from "@netlify/blobs";
import { authenticate, getTierLimits } from "../lib/auth";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";

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
export async function handler(event: HandlerEvent, context: HandlerContext) {
  // Rate limiting: 60 requests per minute per client
  const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.STANDARD);
  if (rateLimitResponse) return rateLimitResponse;

  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    // Authenticate user and get athlete ID
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0"
        },
        body: JSON.stringify({ error: auth.error })
      };
    }

    const { userId, athleteId, subscriptionTier } = auth;

    // Get tier limits (for logging/metadata purposes)
    const limits = getTierLimits(subscriptionTier);

    // Extract activity ID from path
    const pathParts = event.path.split('/');
    const activityId = pathParts[pathParts.length - 1];

    if (!activityId || activityId === 'api-streams') {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0"
        },
        body: JSON.stringify({ error: "Activity ID required" })
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
            "X-Cache": "HIT"
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
        "X-Cache-Write": cacheStatus
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
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      body: JSON.stringify({ 
        error: "Failed to fetch streams",
        message: error.message 
      })
    };
  }
}
