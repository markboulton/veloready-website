import { withDb } from "../lib/db";

/**
 * Cleanup Old Activity Streams (Strava API Compliance)
 * 
 * Per Strava API Agreement: Raw stream data cannot be cached >7 days
 * This function deletes any activity streams older than 7 days
 * 
 * Runs daily at 3am
 */
export async function handler() {
  console.log("[Cleanup] Starting cleanup of activity streams older than 7 days");
  
  try {
    await withDb(async (c) => {
      // Delete streams for activities created more than 7 days ago
      const result = await c.query(`
        DELETE FROM activity_stream 
        WHERE activity_id IN (
          SELECT id FROM activity 
          WHERE created_at < now() - interval '7 days'
        )
      `);
      
      console.log(`[Cleanup] Deleted ${result.rowCount} old stream records`);
      
      // Log cleanup to audit log
      await c.query(
        `INSERT INTO audit_log(kind, ref_id, note) VALUES ($1, $2, $3)`,
        ['cleanup', 'system', `Deleted ${result.rowCount} streams older than 7 days`]
      );
    });
    
    return { 
      statusCode: 200, 
      body: JSON.stringify({ ok: 1, message: "Cleanup completed" })
    };
    
  } catch (error: any) {
    console.error("[Cleanup] Error:", error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ ok: 0, error: error.message })
    };
  }
}
