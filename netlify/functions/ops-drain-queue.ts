import { HandlerEvent } from "@netlify/functions";
import { popLive } from "../lib/queue";
import { withDb, upsertActivitySummary, getAthlete } from "../lib/db-pooled";

/**
 * Manual queue drain for testing
 * Processes jobs from the live queue immediately
 */
export async function handler(event: HandlerEvent) {
  try {
    console.log("[Manual Drain] Starting queue drain...");
    
    let processed = 0;
    const results: any[] = [];
    
    // Process up to 10 jobs
    for (let i = 0; i < 10; i++) {
      let rawJob = await popLive();
      if (!rawJob) {
        console.log("[Manual Drain] Queue is empty");
        break;
      }
      
      // Handle double-encoded JSON from Redis
      let job = rawJob;
      if (rawJob.value && typeof rawJob.value === 'string') {
        try {
          job = JSON.parse(rawJob.value);
        } catch (e) {
          console.error("[Manual Drain] Failed to parse job.value:", rawJob);
          results.push({ job: rawJob, status: "error", error: "invalid_json" });
          continue;
        }
      }
      
      console.log(`[Manual Drain] Processing job ${i + 1}:`, job);
      
      try {
        if (job.kind === "sync-activity") {
          // Fetch athlete tokens
          const athlete = await withDb(async (c) => {
            return await getAthlete(c, job.athlete_id);
          });
          
          if (!athlete || !athlete.access_token) {
            console.error(`[Manual Drain] No athlete or token for ${job.athlete_id}`);
            results.push({ job, status: "error", error: "no_athlete_token" });
            continue;
          }
          
          // Fetch activity from Strava
          const stravaUrl = `https://www.strava.com/api/v3/activities/${job.activity_id}`;
          const response = await fetch(stravaUrl, {
            headers: { "Authorization": `Bearer ${athlete.access_token}` }
          });

          if (!response.ok) {
            console.error(`[Manual Drain] Strava API error: ${response.status}`);
            results.push({ job, status: "error", error: `strava_${response.status}` });
            continue;
          }

          const activity = await response.json();
          console.log(`[Manual Drain] Fetched activity: ${activity.name}`);

          // Log successful API call to audit_log
          try {
            await withDb(async (c) => {
              const { rows } = await c.query(`SELECT user_id FROM athlete WHERE id = $1`, [job.athlete_id]);
              const userId = rows[0]?.user_id || null;
              await c.query(
                `INSERT INTO audit_log(kind, ref_id, note, athlete_id, user_id) VALUES ($1, $2, $3, $4, $5)`,
                ['api', String(job.athlete_id), 'activities:manual-sync', job.athlete_id, userId]
              );
            });
          } catch (logError) {
            console.error(`[Manual Drain] Failed to log API call:`, logError);
            // Don't fail the request if logging fails
          }
          
          // Store in database
          await withDb(async (c) => {
            await upsertActivitySummary(c, activity);
          });
          
          console.log(`[Manual Drain] Stored activity ${job.activity_id}`);
          results.push({ job, status: "success", activity_name: activity.name });
          processed++;
          
        } else if (job.kind === "deauth") {
          console.log(`[Manual Drain] Deauth job for athlete ${job.athlete_id}`);
          results.push({ job, status: "skipped", reason: "deauth_handled_by_webhook" });
          
        } else {
          console.log(`[Manual Drain] Unknown job kind: ${job.kind}`);
          results.push({ job, status: "skipped", reason: "unknown_kind" });
        }
      } catch (error: any) {
        console.error(`[Manual Drain] Error processing job:`, error);
        results.push({ job, status: "error", error: error.message });
      }
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: 1,
        processed,
        results
      })
    };
    
  } catch (error: any) {
    console.error("[Manual Drain] Fatal error:", error);
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
