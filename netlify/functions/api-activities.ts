import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { withDb, getAthlete } from "../lib/db";
import { listActivitiesSince } from "../lib/strava";

/**
 * GET /api/activities
 * 
 * Fetch activities for authenticated user with caching
 * 
 * Query params:
 * - daysBack: Number of days to fetch (default: 30, max: 90)
 * - limit: Max activities to return (default: 50, max: 200)
 * 
 * Returns: Array of Strava activities
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
    // For now, using Mark's athlete ID (should be replaced with session auth)
    const athleteId = 104662;
    
    // Parse query parameters
    const daysBack = Math.min(
      parseInt(event.queryStringParameters?.daysBack || "30"),
      90 // Cap at 90 days
    );
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || "50"),
      200 // Strava max
    );

    console.log(`[API Activities] Request: athleteId=${athleteId}, daysBack=${daysBack}, limit=${limit}`);

    // Calculate timestamp for "after" parameter
    const afterTimestamp = Math.floor(Date.now() / 1000) - (daysBack * 24 * 3600);

    // Fetch from Strava (using existing library function)
    const activities = await listActivitiesSince(athleteId, afterTimestamp, 1, limit);

    console.log(`[API Activities] Fetched ${activities.length} activities from Strava`);

    // Return with cache headers (5 minutes)
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300", // 5 minutes cache
        "X-Cache": "MISS", // Indicates this was fetched from Strava
        "X-Activity-Count": activities.length.toString()
      },
      body: JSON.stringify({
        activities,
        metadata: {
          athleteId,
          daysBack,
          limit,
          count: activities.length,
          cachedUntil: new Date(Date.now() + 300000).toISOString()
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
