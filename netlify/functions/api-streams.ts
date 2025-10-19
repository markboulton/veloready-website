import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { getStreams } from "../lib/strava";
import { getStore } from "@netlify/blobs";

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
 * - Layer 1: Netlify Blobs (24 hours) - compliant with Strava 7-day rule
 * - Layer 2: Strava API (on-demand)
 * 
 * This allows iOS app to have its own local cache (7 days) while backend stays compliant
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
    // Extract activity ID from path
    const pathParts = event.path.split('/');
    const activityId = pathParts[pathParts.length - 1];

    if (!activityId || activityId === 'api-streams') {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Activity ID required" })
      };
    }

    console.log(`[API Streams] Request for activity: ${activityId}`);

    // TODO: Get athlete ID from authenticated session
    // For now, using Mark's athlete ID
    const athleteId = 104662;

    // Try Netlify Blobs cache first (24-hour TTL)
    let cached = null;
    try {
      const siteID = process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN 
        || process.env.NETLIFY_TOKEN 
        || process.env.NETLIFY_FUNCTIONS_TOKEN;
      
      const store = getStore({
        name: "streams-cache",
        ...(siteID && token ? { siteID, token } : {})
      });
      const cacheKey = `streams:${athleteId}:${activityId}`;
      cached = await store.get(cacheKey, { type: "json" });
      
      if (cached) {
        console.log(`[API Streams] Cache HIT for ${activityId}`);
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400", // 24 hours
            "X-Cache": "HIT"
          },
          body: JSON.stringify(cached)
        };
      }
    } catch (cacheError: any) {
      // Blobs not configured or cache miss - continue without caching
      console.log(`[API Streams] Blobs not available, skipping cache:`, cacheError?.message || cacheError);
    }

    // Fetch from Strava
    console.log(`[API Streams] Fetching from Strava for ${activityId}`);
    const streams = await getStreams(athleteId, parseInt(activityId));

    // Cache in Netlify Blobs (24 hours)
    try {
      const siteID = process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN 
        || process.env.NETLIFY_TOKEN 
        || process.env.NETLIFY_FUNCTIONS_TOKEN;
      
      const store = getStore({
        name: "streams-cache",
        ...(siteID && token ? { siteID, token } : {})
      });
      const cacheKey = `streams:${athleteId}:${activityId}`;
      await store.setJSON(cacheKey, streams, {
        metadata: {
          athleteId: athleteId.toString(),
          activityId,
          cachedAt: new Date().toISOString()
        }
      });
      console.log(`[API Streams] Cached streams for ${activityId}`);
    } catch (cacheError: any) {
      // Caching failed - not critical, continue
      console.log(`[API Streams] Caching skipped:`, cacheError?.message || cacheError);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400", // 24 hours
        "X-Cache": "MISS"
      },
      body: JSON.stringify(streams)
    };

  } catch (error: any) {
    console.error("[API Streams] Error:", error);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to fetch streams",
        message: error.message 
      })
    };
  }
}
