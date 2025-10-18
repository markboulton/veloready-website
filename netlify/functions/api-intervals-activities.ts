import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { withDb, getAthlete } from "../lib/db";

/**
 * GET /api/intervals/activities
 * 
 * Fetch activities from Intervals.icu with caching
 * 
 * Query params:
 * - daysBack: Number of days to fetch (default: 30, max: 120)
 * - limit: Max activities to return (default: 50, max: 200)
 * 
 * Returns: Array of Intervals.icu activities
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
    // TODO: Get athlete ID from authenticated session
    const athleteId = 104662;
    
    // Parse query parameters
    const daysBack = Math.min(
      parseInt(event.queryStringParameters?.daysBack || "30"),
      120 // Intervals allows longer history
    );
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || "50"),
      200
    );

    console.log(`[API Intervals Activities] Request: athleteId=${athleteId}, daysBack=${daysBack}, limit=${limit}`);

    // Get Intervals.icu credentials from database
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
    startDate.setDate(startDate.getDate() - daysBack);

    // Fetch from Intervals.icu API
    const url = `https://intervals.icu/api/v1/athlete/${athlete.intervals_athlete_id}/activities`;
    const params = new URLSearchParams({
      oldest: startDate.toISOString().split('T')[0],
      newest: endDate.toISOString().split('T')[0]
    });

    console.log(`[API Intervals Activities] Fetching from: ${url}?${params}`);

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`API_KEY:${athlete.intervals_api_key}`).toString('base64')}`
      }
    });

    if (!response.ok) {
      console.error(`[API Intervals Activities] Intervals API error: ${response.status}`);
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Failed to fetch from Intervals.icu",
          status: response.status
        })
      };
    }

    const activities = await response.json();
    
    // Limit results
    const limitedActivities = activities.slice(0, limit);

    console.log(`[API Intervals Activities] Fetched ${limitedActivities.length} activities from Intervals.icu`);

    // Return with cache headers (5 minutes)
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300", // 5 minutes cache
        "X-Cache": "MISS", // Indicates this was fetched from Intervals
        "X-Source": "intervals.icu",
        "X-Activity-Count": limitedActivities.length.toString()
      },
      body: JSON.stringify({
        activities: limitedActivities,
        metadata: {
          athleteId: athlete.intervals_athlete_id,
          daysBack,
          limit,
          count: limitedActivities.length,
          source: "intervals.icu",
          cachedUntil: new Date(Date.now() + 300000).toISOString()
        }
      })
    };

  } catch (error: any) {
    console.error("[API Intervals Activities] Error:", error);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to fetch activities from Intervals.icu",
        message: error.message 
      })
    };
  }
}
