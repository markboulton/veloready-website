import { HandlerEvent } from "@netlify/functions";
import { withDb } from "../lib/db-pooled";
import { ENV } from "../lib/env";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";

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
  // Rate limiting: 30 requests per minute (stricter - calls Strava API)
  const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.STRICT);
  if (rateLimitResponse) return rateLimitResponse;


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

    // Fetch streams from Strava API
    const streamsUrl = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${keys}&key_by_type=true`;
    const response = await fetch(streamsUrl, {
      headers: {
        "Authorization": `Bearer ${athlete.access_token}`
      }
    });

    // Log successful API call to audit_log
    if (response.ok) {
      try {
        await withDb(async (c) => {
          const { rows } = await c.query(`SELECT user_id FROM athlete WHERE id = $1`, [athleteId]);
          const userId = rows[0]?.user_id || null;
          await c.query(
            `INSERT INTO audit_log(kind, ref_id, note, athlete_id, user_id) VALUES ($1, $2, $3, $4, $5)`,
            ['api', athleteId, 'streams:request', athleteId, userId]
          );
        });
      } catch (logError) {
        console.error(`[Streams API] Failed to log API call:`, logError);
        // Don't fail the request if logging fails
      }
    }

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
        "Cache-Control": "public, max-age=3600" // Cache for 1 hour
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
