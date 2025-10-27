import { schedule } from "@netlify/functions";
import { withDb } from "../lib/db-pooled";

/**
 * Cleanup Old Audit Logs
 * 
 * Runs daily at 4am UTC to delete audit logs older than 30 days.
 * Prevents unbounded growth of the audit_log table.
 * 
 * Schedule: 0 4 * * * (4am UTC daily)
 */
export const handler = schedule("0 4 * * *", async () => {
  console.log("[Audit Log Cleanup] Starting cleanup...");

  try {
    const result = await withDb(async (c) => {
      // Delete audit logs older than 30 days
      const { rowCount } = await c.query(
        `DELETE FROM audit_log 
         WHERE at < NOW() - INTERVAL '30 days'`
      );

      return { deleted: rowCount || 0 };
    });

    console.log(`[Audit Log Cleanup] ✅ Deleted ${result.deleted} old audit logs`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        deleted: result.deleted,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error: any) {
    console.error("[Audit Log Cleanup] ❌ Error:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
});
