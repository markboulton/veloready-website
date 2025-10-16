import { HandlerEvent } from "@netlify/functions";
import { enqueueLive } from "../lib/queue";
import { withDb } from "../lib/db";
import { rpush } from "../lib/redis";

export async function handler(event: HandlerEvent) {
  // Verification handshake
  if (event.httpMethod === "GET") {
    const url = new URL(event.rawUrl);
    const challenge = url.searchParams.get("hub.challenge");
    return { statusCode: 200, body: JSON.stringify({ "hub.challenge": challenge }) };
  }

  // Handle event quickly (<2s)
  const body = JSON.parse(event.body || "{}");
  // Example payload shape: { owner_id, object_id, object_type, aspect_type, updates, ... }

  // Log webhook event to audit log
  try {
    await withDb(async (c) => {
      // Get user_id from athlete for RLS compliance
      const { rows } = await c.query(`SELECT user_id FROM athlete WHERE id = $1`, [body.owner_id]);
      const userId = rows[0]?.user_id || null;
      
      await c.query(
        `insert into audit_log(kind, ref_id, note, athlete_id, user_id) values ($1,$2,$3,$4,$5)`,
        ['webhook', String(body.owner_id), `${body.object_type}:${body.aspect_type}:${body.object_id || 'n/a'}`, body.owner_id, userId]
      );
    });
  } catch (error) {
    console.error("[Webhook] Failed to log to audit_log:", error);
    // Continue processing even if logging fails
  }

  if (body.object_type === "activity" && body.aspect_type === "create") {
    // Use batch queue for rate limit management (processed every 6 hours)
    await rpush("queue:batch", { kind: "sync-activity", athlete_id: body.owner_id, activity_id: body.object_id });
  } else if (body.object_type === "activity" && body.aspect_type === "update") {
    // only re-fetch if meaningful fields changed
    const changed = body.updates || {};
    if (changed.title || changed.type || changed.visibility || changed.private) {
      await rpush("queue:batch", { kind: "sync-activity", athlete_id: body.owner_id, activity_id: body.object_id });
    }
  } else if (body.aspect_type === "delete") {
    await rpush("queue:batch", { kind: "delete-activity", athlete_id: body.owner_id, activity_id: body.object_id });
  } else if (body.object_type === "athlete" && body.updates?.authorized === "false") {
    // Webhook-driven deauth: immediate cleanup
    const stravaId = String(body.owner_id);
    console.log(`[Strava Webhook] Deauth event for athlete ${stravaId}`);
    
    await withDb(async (c) => {
      // Get user_id before deleting athlete
      const { rows } = await c.query(`SELECT user_id FROM athlete WHERE id = $1`, [stravaId]);
      const userId = rows[0]?.user_id || null;
      
      // Log the deauth action
      await c.query(
        `insert into audit_log(kind, ref_id, note, athlete_id, user_id) values ($1,$2,$3,$4,$5)`,
        ['deauth', stravaId, 'webhook', stravaId, userId]
      );
      
      // Delete athlete record (cascade will remove tokens and activities)
      const result = await c.query(
        `delete from athlete where id = $1`,
        [stravaId]
      );
      
      console.log(`[Strava Webhook] Deleted ${result.rowCount} athlete record(s)`);
    });
    
    // Also enqueue for any additional cleanup
    await enqueueLive({ kind: "deauth", athlete_id: body.owner_id });
  }

  return { statusCode: 200, body: "ok" };
}