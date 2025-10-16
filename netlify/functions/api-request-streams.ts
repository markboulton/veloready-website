import { HandlerEvent } from "@netlify/functions";
import { withDb } from "../lib/db";
import { ENV } from "../lib/env";
import { trackStravaAPICall } from "../lib/apiTracking";

/**
 * On-demand Strava Streams API
 * 
 * Fetches activity streams (time, distance, altitude, heartrate, watts, cadence, etc.)
 * with privacy/visibility enforcement
 * 
 * Query params:
 *   - activity_id: Strava activity ID
 *   - athlete_id: Strava athlete ID (for auth check)
 *   - keys: comma-separated stream types (e.g., "time,distance,altitude,heartrate,watts")
 */
export async function handler(event: HandlerEvent) {
  try {
    const url = new URL(event.rawUrl);
    const activityId = url.searchParams.get("activity_id");
    const athleteId = url.searchParams.get("athlete_id");
    const keys = url.searchParams.get("keys") || "time,distance,altitude,heartrate,watts,cadence,temp";

    if (!activityId || !athleteId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: 0, error: "missing activity_id or athlete_id" })
      };
    }

    console.log(`[Streams API] Request for activity ${activityId} by athlete ${athleteId}`);

    // Check privacy/visibility in database
    const activity = await withDb(async (c) => {
      const { rows } = await c.query(
        `select id, athlete_id, private, visibility from activity where id = $1`,
        [activityId]
      );
      return rows[0] ?? null;
    });

    if (!activity) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: 0, error: "activity not found" })
      };
    }

    // Enforce privacy: only owner can access private activities
    if (activity.private || activity.visibility === "only_me") {
      if (String(activity.athlete_id) !== athleteId) {
        console.log(`[Streams API] Privacy violation: athlete ${athleteId} cannot access private activity ${activityId}`);
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ok: 0, error: "activity is private" })
        };
      }
    }

    // Fetch access token for the athlete
    const athlete = await withDb(async (c) => {
      const { rows } = await c.query(
        `select access_token, refresh_token, expires_at from athlete where id = $1`,
        [athleteId]
      );
      return rows[0] ?? null;
    });

    if (!athlete || !athlete.access_token) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: 0, error: "athlete not authenticated" })
      };
    }

    // TODO: Check if token is expired and refresh if needed
    // For now, assume token is valid

    // Track API call for rate limit monitoring
    await trackStravaAPICall("streams");
    
    // Fetch streams from Strava API
    const streamsUrl = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${keys}&key_by_type=true`;
    const response = await fetch(streamsUrl, {
      headers: {
        "Authorization": `Bearer ${athlete.access_token}`
      }
    });

    if (!response.ok) {
      console.error(`[Streams API] Strava API error: ${response.status} ${response.statusText}`);
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: 0, error: `Strava API error: ${response.statusText}` })
      };
    }

    const streams = await response.json();
    
    console.log(`[Streams API] Successfully fetched streams for activity ${activityId}`);

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400" // Cache for 24 hours (Strava compliant, <7 days)
      },
      body: JSON.stringify({
        ok: 1,
        activity_id: activityId,
        streams
      })
    };

  } catch (error: any) {
    console.error("[Streams API] Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: 0,
        error: error.message
      })
    };
  }
}
