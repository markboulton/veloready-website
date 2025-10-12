import { HandlerEvent } from "@netlify/functions";
import { withDb } from "../lib/db";

/**
 * Disconnect Strava for the authenticated athlete
 * 
 * User-initiated deauth: removes tokens and logs the action
 * Query param: strava_athlete_id
 */
export async function handler(event: HandlerEvent) {
  try {
    const url = new URL(event.rawUrl);
    const stravaId = url.searchParams.get("strava_athlete_id");
    
    if (!stravaId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: 0, error: "missing strava_athlete_id" })
      };
    }

    console.log(`[Strava Disconnect] User-initiated deauth for athlete ${stravaId}`);

    await withDb(async (c) => {
      // Log the deauth action
      await c.query(
        `insert into audit_log(kind, ref_id, note) values ($1,$2,$3)`,
        ['deauth', stravaId, 'user requested']
      );
      
      // Delete athlete record (cascade will remove tokens)
      const result = await c.query(
        `delete from athlete where id = $1`,
        [stravaId]
      );
      
      console.log(`[Strava Disconnect] Deleted ${result.rowCount} athlete record(s)`);
    });

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify({
        ok: 1,
        message: "Disconnected from Strava"
      })
    };
  } catch (error: any) {
    console.error("[Strava Disconnect] Error:", error);
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
