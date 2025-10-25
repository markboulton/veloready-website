import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { withDb } from "../lib/db";
import { getStore } from "@netlify/blobs";
import { authenticate } from "../lib/auth";

/**
 * GET /api/intervals/streams/:activityId
 * 
 * Fetch activity streams from Intervals.icu with multi-layer caching
 * 
 * Path params:
 * - activityId: Intervals.icu activity ID
 * 
 * Returns: Activity stream data (power, HR, cadence, etc.)
 * 
 * Caching Strategy:
 * - Layer 1: Netlify Blobs (24 hours)
 * - Layer 2: Intervals.icu API (on-demand)
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
    
    const { userId, athleteId } = auth;

    // Extract activity ID from path
    const pathParts = event.path.split('/');
    const activityId = pathParts[pathParts.length - 1];

    if (!activityId || activityId === 'api-intervals-streams') {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Activity ID required" })
      };
    }

    console.log(`[API Intervals Streams] Request for activity: ${activityId} (athlete: ${athleteId})`);

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
        body: JSON.stringify({ error: "Not connected to Intervals.icu" })
      };
    }

    // Check Netlify Blobs cache first (24-hour TTL)
    const store = getStore("streams-cache");
    const cacheKey = `intervals:streams:${athlete.intervals_athlete_id}:${activityId}`;
    
    try {
      const cached = await store.get(cacheKey, { type: "json" });
      if (cached) {
        console.log(`[API Intervals Streams] Cache HIT for ${activityId}`);
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=86400", // 24 hours (user-specific)
            "X-Cache": "HIT",
            "X-Source": "intervals.icu"
          },
          body: JSON.stringify(cached)
        };
      }
    } catch (cacheError) {
      console.log(`[API Intervals Streams] Cache miss for ${activityId}:`, cacheError);
    }

    // Cache miss - fetch from Intervals.icu
    console.log(`[API Intervals Streams] Cache MISS - fetching from Intervals.icu for ${activityId}`);
    
    const url = `https://intervals.icu/api/v1/activity/${activityId}/streams`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`API_KEY:${athlete.intervals_api_key}`).toString('base64')}`
      }
    });

    if (!response.ok) {
      console.error(`[API Intervals Streams] Intervals API error: ${response.status}`);
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Failed to fetch streams from Intervals.icu",
          status: response.status
        })
      };
    }

    const streams = await response.json();

    // Cache in Netlify Blobs (24 hours)
    try {
      await store.setJSON(cacheKey, streams, {
        metadata: {
          athleteId: athlete.intervals_athlete_id,
          activityId,
          source: "intervals.icu",
          cachedAt: new Date().toISOString()
        }
      });
      console.log(`[API Intervals Streams] Cached streams for ${activityId}`);
    } catch (cacheError) {
      console.error(`[API Intervals Streams] Failed to cache:`, cacheError);
      // Continue anyway - caching is not critical
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=86400", // 24 hours (user-specific)
        "X-Cache": "MISS",
        "X-Source": "intervals.icu"
      },
      body: JSON.stringify(streams)
    };

  } catch (error: any) {
    console.error("[API Intervals Streams] Error:", error);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to fetch streams from Intervals.icu",
        message: error.message 
      })
    };
  }
}
