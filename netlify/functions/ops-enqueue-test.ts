import { HandlerEvent } from "@netlify/functions";
import { enqueueLive } from "../lib/queue";

/**
 * Manual job enqueue for testing
 * Usage: /ops/enqueue-test?athlete_id=104662&activity_id=16108769434
 */
export async function handler(event: HandlerEvent) {
  try {
    const url = new URL(event.rawUrl);
    const athleteId = url.searchParams.get("athlete_id");
    const activityId = url.searchParams.get("activity_id");
    
    if (!athleteId || !activityId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: 0,
          error: "missing athlete_id or activity_id"
        })
      };
    }
    
    console.log(`[Test Enqueue] Enqueueing activity ${activityId} for athlete ${athleteId}`);
    
    await enqueueLive({
      kind: "sync-activity",
      athlete_id: parseInt(athleteId),
      activity_id: activityId
    });
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: 1,
        message: "Job enqueued",
        job: {
          kind: "sync-activity",
          athlete_id: athleteId,
          activity_id: activityId
        }
      })
    };
    
  } catch (error: any) {
    console.error("[Test Enqueue] Error:", error);
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
