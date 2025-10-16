import { schedule } from "@netlify/functions";
import { lpop } from "../lib/redis";
import { withDb } from "../lib/db";
import { trackStravaAPICall } from "../lib/apiTracking";
import { ENV } from "../lib/env";

/**
 * Batch Queue Processor - Scheduled Function
 * 
 * Runs every 6 hours to process queued webhook events in batches
 * This spreads API load evenly and prevents rate limit spikes
 * 
 * Schedule: 00:00, 06:00, 12:00, 18:00 UTC
 * 
 * Processes up to 200 activities per batch (well under 15-min rate limit of 100)
 */
const handler = async () => {
  console.log("[Batch Processor] Starting scheduled batch processing");
  
  const startTime = Date.now();
  let processed = 0;
  let errors = 0;
  const MAX_BATCH_SIZE = 200; // Process up to 200 per 6-hour window
  
  try {
    // Process jobs from the "batch" queue (populated by webhook)
    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      const job = await lpop("queue:batch");
      
      if (!job) {
        console.log(`[Batch Processor] No more jobs in queue (processed ${processed})`);
        break;
      }
      
      try {
        if (job.kind === "sync-activity") {
          await syncActivity(job.athlete_id, job.activity_id);
          processed++;
        } else if (job.kind === "delete-activity") {
          await deleteActivity(job.activity_id);
          processed++;
        }
        
        // Small delay to avoid rate limit spikes (100 calls/15min = ~1 per 9 seconds)
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
        
      } catch (error) {
        console.error(`[Batch Processor] Failed to process job:`, error);
        errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Batch Processor] Completed: ${processed} processed, ${errors} errors, ${duration}ms`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        processed,
        errors,
        duration_ms: duration
      })
    };
    
  } catch (error) {
    console.error("[Batch Processor] Fatal error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Batch processing failed" })
    };
  }
};

/**
 * Sync activity from Strava
 */
async function syncActivity(athleteId: string, activityId: string) {
  console.log(`[Batch] Syncing activity ${activityId} for athlete ${athleteId}`);
  
  // Get athlete tokens
  const athlete = await withDb(async (c) => {
    const { rows } = await c.query(
      `select access_token, user_id from athlete where id = $1`,
      [athleteId]
    );
    return rows[0] ?? null;
  });
  
  if (!athlete || !athlete.access_token) {
    console.error(`[Batch] Athlete ${athleteId} not found or not authenticated`);
    return;
  }
  
  // Fetch activity from Strava
  trackStravaAPICall("activities");
  const response = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    {
      headers: { Authorization: `Bearer ${athlete.access_token}` }
    }
  );
  
  if (!response.ok) {
    console.error(`[Batch] Strava API error: ${response.status}`);
    return;
  }
  
  const activity = await response.json();
  
  // Upsert to database
  await withDb(async (c) => {
    await c.query(
      `insert into activity (
        id, athlete_id, user_id, name, type, start_date, distance, 
        moving_time, elapsed_time, total_elevation_gain, 
        average_speed, max_speed, average_cadence, average_heartrate, 
        max_heartrate, average_watts, weighted_average_watts, 
        kilojoules, calories, private, visibility, 
        gear_id, start_latlng, end_latlng, map_polyline
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, $17, $18, $19, 
        $20, $21, $22, $23, $24, $25
      ) 
      on conflict (id) do update set
        name = excluded.name,
        type = excluded.type,
        private = excluded.private,
        visibility = excluded.visibility,
        updated_at = now()`,
      [
        activity.id, athleteId, athlete.user_id, activity.name, activity.type,
        activity.start_date, activity.distance, activity.moving_time,
        activity.elapsed_time, activity.total_elevation_gain,
        activity.average_speed, activity.max_speed, activity.average_cadence,
        activity.average_heartrate, activity.max_heartrate,
        activity.average_watts, activity.weighted_average_watts,
        activity.kilojoules, activity.calories, activity.private,
        activity.visibility || "everyone", activity.gear_id,
        activity.start_latlng ? JSON.stringify(activity.start_latlng) : null,
        activity.end_latlng ? JSON.stringify(activity.end_latlng) : null,
        activity.map?.summary_polyline || null
      ]
    );
  });
  
  console.log(`[Batch] Successfully synced activity ${activityId}`);
}

/**
 * Delete activity
 */
async function deleteActivity(activityId: string) {
  console.log(`[Batch] Deleting activity ${activityId}`);
  
  await withDb(async (c) => {
    await c.query(`delete from activity where id = $1`, [activityId]);
  });
  
  console.log(`[Batch] Successfully deleted activity ${activityId}`);
}

// Schedule: Run every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
export default schedule("0 */6 * * *", handler);
