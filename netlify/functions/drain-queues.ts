import { schedule } from "@netlify/functions";
import { popLive } from "../lib/queue";
import { withDb, upsertActivitySummary, getAthlete } from "../lib/db";

/**
 * Scheduled worker that drains the queue every 5 minutes
 * Processes jobs from the live queue automatically
 */
const handler = schedule("*/5 * * * *", async (event) => {
  const startTime = Date.now();
  console.log("[Scheduled Drain] Starting queue drain...");
  
  let processed = 0;
  let errors = 0;
  const maxJobs = 50; // Process up to 50 jobs per run
  
  try {
    // Process jobs until queue is empty or max reached
    for (let i = 0; i < maxJobs; i++) {
      let rawJob = await popLive();
      if (!rawJob) {
        console.log(`[Scheduled Drain] Queue is empty after ${i} jobs`);
        break;
      }
      
      // Handle double-encoded JSON from Redis
      let job = rawJob;
      if (rawJob.value && typeof rawJob.value === 'string') {
        try {
          job = JSON.parse(rawJob.value);
        } catch (e) {
          console.error("[Scheduled Drain] Failed to parse job.value:", rawJob);
          errors++;
          continue;
        }
      }
      
      console.log(`[Scheduled Drain] Processing job ${i + 1}:`, job);
      
      try {
        if (job.kind === "sync-activity") {
          // Fetch athlete tokens
          const athlete = await withDb(async (c) => {
            return await getAthlete(c, job.athlete_id);
          });
          
          if (!athlete || !athlete.access_token) {
            console.error(`[Scheduled Drain] No athlete or token for ${job.athlete_id}`);
            errors++;
            continue;
          }
          
          // Fetch activity from Strava
          const stravaUrl = `https://www.strava.com/api/v3/activities/${job.activity_id}`;
          const response = await fetch(stravaUrl, {
            headers: { "Authorization": `Bearer ${athlete.access_token}` }
          });
          
          if (!response.ok) {
            console.error(`[Scheduled Drain] Strava API error: ${response.status}`);
            errors++;
            continue;
          }
          
          const activity = await response.json();
          console.log(`[Scheduled Drain] Fetched activity: ${activity.name}`);
          
          // Store in database
          await withDb(async (c) => {
            await upsertActivitySummary(c, activity);
          });
          
          console.log(`[Scheduled Drain] Stored activity ${job.activity_id}`);
          processed++;
          
        } else if (job.kind === "delete-activity") {
          // Handle activity deletion
          await withDb(async (c) => {
            await c.query(
              `DELETE FROM activity WHERE id = $1`,
              [String(job.activity_id)]
            );
          });
          console.log(`[Scheduled Drain] Deleted activity ${job.activity_id}`);
          processed++;
          
        } else if (job.kind === "deauth") {
          console.log(`[Scheduled Drain] Deauth job for athlete ${job.athlete_id} (already handled by webhook)`);
          processed++;
          
        } else {
          console.log(`[Scheduled Drain] Unknown job kind: ${job.kind}`);
          errors++;
        }
      } catch (error: any) {
        console.error(`[Scheduled Drain] Error processing job:`, error);
        errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduled Drain] Completed: ${processed} processed, ${errors} errors in ${duration}ms`);
    
    return {
      statusCode: 200
    };
    
  } catch (error: any) {
    console.error("[Scheduled Drain] Fatal error:", error);
    return {
      statusCode: 500
    };
  }
});

export { handler };
