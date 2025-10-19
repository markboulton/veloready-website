import { HandlerEvent } from "@netlify/functions";
import { withDb } from "../lib/db";

/**
 * User Management Actions
 * 
 * Admin actions for managing users:
 * - Delete user and all data
 * - Toggle PRO subscription (for testing)
 * - Reset user data
 * - Force token refresh
 * 
 * POST /ops/user-action
 * Body: { action: string, athleteId: string, ...params }
 */
export async function handler(event: HandlerEvent) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { action, athleteId, ...params } = JSON.parse(event.body || "{}");

    if (!action || !athleteId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing action or athleteId" })
      };
    }

    let result: any = {};

    switch (action) {
      case "delete_user":
        result = await deleteUser(athleteId);
        break;
      
      case "delete_activities":
        result = await deleteUserActivities(athleteId);
        break;
      
      case "get_user_stats":
        result = await getUserStats(athleteId);
        break;
      
      case "clear_queue_jobs":
        result = await clearQueueJobsForUser(athleteId);
        break;
      
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Unknown action: ${action}` })
        };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        action,
        athleteId,
        result,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error: any) {
    console.error("[User Action] Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        success: false,
        error: error.message 
      })
    };
  }
}

// Delete user and all associated data
async function deleteUser(athleteId: string) {
  return await withDb(async (c) => {
    // Get user_id first
    const { rows: userRows } = await c.query(
      `SELECT user_id FROM athlete WHERE id = $1`,
      [athleteId]
    );
    const userId = userRows[0]?.user_id;

    // Delete athlete (cascade will handle activities, tokens, etc.)
    const { rowCount } = await c.query(
      `DELETE FROM athlete WHERE id = $1`,
      [athleteId]
    );

    // Log the action
    await c.query(
      `INSERT INTO audit_log(kind, ref_id, note, athlete_id, user_id) 
       VALUES ($1, $2, $3, $4, $5)`,
      ['admin_action', athleteId, 'User deleted via ops dashboard', athleteId, userId]
    );

    return {
      deleted: rowCount > 0,
      athlete_id: athleteId,
      message: rowCount > 0 ? 
        "User and all associated data deleted" : 
        "User not found"
    };
  });
}

// Delete all activities for a user (but keep user account)
async function deleteUserActivities(athleteId: string) {
  return await withDb(async (c) => {
    const { rowCount } = await c.query(
      `DELETE FROM activity WHERE athlete_id = $1`,
      [athleteId]
    );

    await c.query(
      `INSERT INTO audit_log(kind, ref_id, note, athlete_id) 
       VALUES ($1, $2, $3, $4)`,
      ['admin_action', athleteId, `Deleted ${rowCount} activities`, athleteId]
    );

    return {
      deleted_count: rowCount,
      athlete_id: athleteId,
      message: `Deleted ${rowCount} activities`
    };
  });
}

// Get detailed stats for a specific user
async function getUserStats(athleteId: string) {
  return await withDb(async (c) => {
    const { rows: activityStats } = await c.query(
      `SELECT 
         COUNT(*) as total_activities,
         COUNT(*) FILTER (WHERE type = 'Ride') as rides,
         COUNT(*) FILTER (WHERE type = 'Run') as runs,
         MIN(start_date) as first_activity,
         MAX(start_date) as last_activity,
         SUM(distance) as total_distance_meters
       FROM activity 
       WHERE athlete_id = $1`,
      [athleteId]
    );

    const { rows: athleteInfo } = await c.query(
      `SELECT id, scopes, expires_at, created_at, updated_at,
              expires_at < now() as token_expired
       FROM athlete 
       WHERE id = $1`,
      [athleteId]
    );

    return {
      athlete: athleteInfo[0] || null,
      stats: activityStats[0] || null
    };
  });
}

// Clear any pending queue jobs for this user
async function clearQueueJobsForUser(athleteId: string) {
  // Note: This would require implementing queue job removal in Upstash
  // For now, just log the action
  return await withDb(async (c) => {
    await c.query(
      `INSERT INTO audit_log(kind, ref_id, note, athlete_id) 
       VALUES ($1, $2, $3, $4)`,
      ['admin_action', athleteId, 'Queue jobs cleared (if any)', athleteId]
    );

    return {
      message: "Queue clearing requested (manual verification needed in Upstash)",
      athlete_id: athleteId
    };
  });
}
