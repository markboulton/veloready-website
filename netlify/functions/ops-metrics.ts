import { HandlerEvent } from "@netlify/functions";
import { withDb } from "../lib/db";  // Temporarily use old connection method
import { depth, Q } from "../lib/queue";
import { get } from "../lib/redis";

/**
 * Operations Metrics JSON API
 * 
 * Returns system metrics for monitoring dashboard
 * Includes: athlete count, activity count, recent deauths, API usage, queue depth, etc.
 */
export async function handler(event: HandlerEvent) {
  try {
    console.log("[Ops Metrics] Fetching system metrics");

    const metrics = await withDb(async (c) => {
      // Total athletes
      const { rows: athleteCount } = await c.query(
        `select count(*) as count from athlete`
      );

      // Athlete details with connection info
      const { rows: athleteDetails } = await c.query(
        `select id, scopes, expires_at, created_at, updated_at,
                expires_at < now() as token_expired,
                extract(epoch from (now() - created_at))/3600 as hours_since_connection
         from athlete 
         order by created_at desc 
         limit 50`
      );

      // Total activities
      const { rows: activityCount } = await c.query(
        `select count(*) as count from activity`
      );

      // Activities by visibility
      const { rows: visibilityBreakdown } = await c.query(
        `select visibility, count(*) as count from activity group by visibility`
      );

      // Recent deauths (last 7 days)
      const { rows: recentDeauths } = await c.query(
        `select count(*) as count from audit_log 
         where kind = 'deauth'`
      );

      // Recent deauth details (last 10)
      const { rows: deauthLog } = await c.query(
        `select ref_id, note from audit_log 
         where kind = 'deauth' 
         limit 10`
      );

      // Recent webhook events (last 20)
      const { rows: webhookLog } = await c.query(
        `select ref_id, note from audit_log 
         where kind = 'webhook' 
         order by id desc 
         limit 20`
      );

      // Recent cleanup events (last 10)
      const { rows: cleanupLog } = await c.query(
        `select note from audit_log 
         where kind = 'cleanup' 
         order by id desc 
         limit 10`
      );

      // Activities created in last 24h
      const { rows: recentActivities } = await c.query(
        `select count(*) as count from activity 
         where created_at > now() - interval '24 hours'`
      );

      // Recent activity syncs (last 20)
      const { rows: recentActivitySyncs } = await c.query(
        `select id, athlete_id, type, start_date, private, visibility, created_at, updated_at
         from activity 
         order by created_at desc 
         limit 20`
      );

      // Activity sync stats
      const { rows: syncStats } = await c.query(
        `select 
           count(*) filter (where created_at > now() - interval '1 hour') as last_hour,
           count(*) filter (where created_at > now() - interval '1 day') as last_day,
           count(*) filter (where created_at > now() - interval '7 days') as last_week
         from activity`
      );

      // Token expiry status
      const { rows: tokenStatus } = await c.query(
        `select 
           count(*) filter (where expires_at < now()) as expired,
           count(*) filter (where expires_at > now()) as valid
         from athlete`
      );

      return {
        athletes: {
          total: parseInt(athleteCount[0]?.count || "0"),
          tokens: {
            valid: parseInt(tokenStatus[0]?.valid || "0"),
            expired: parseInt(tokenStatus[0]?.expired || "0")
          },
          list: athleteDetails.map((row: any) => ({
            id: row.id,
            scopes: row.scopes,
            token_expired: row.token_expired,
            expires_at: row.expires_at,
            connected_at: row.created_at,
            last_updated: row.updated_at,
            hours_since_connection: parseFloat(row.hours_since_connection || "0").toFixed(1)
          }))
        },
        activities: {
          total: parseInt(activityCount[0]?.count || "0"),
          last_24h: parseInt(recentActivities[0]?.count || "0"),
          sync_stats: {
            last_hour: parseInt(syncStats[0]?.last_hour || "0"),
            last_day: parseInt(syncStats[0]?.last_day || "0"),
            last_week: parseInt(syncStats[0]?.last_week || "0")
          },
          by_visibility: visibilityBreakdown.reduce((acc: Record<string, number>, row: any) => {
            acc[row.visibility || "unknown"] = parseInt(row.count);
            return acc;
          }, {} as Record<string, number>),
          recent_syncs: recentActivitySyncs.map((row: any) => ({
            id: row.id,
            athlete_id: row.athlete_id,
            type: row.type,
            start_date: row.start_date,
            private: row.private,
            visibility: row.visibility,
            synced_at: row.created_at
          }))
        },
        deauths: {
          last_7_days: parseInt(recentDeauths[0]?.count || "0"),
          recent: deauthLog.map((row: any) => ({
            athlete_id: row.ref_id,
            reason: row.note
          }))
        },
        webhooks: {
          recent: webhookLog.map((row: any) => ({
            athlete_id: row.ref_id,
            event: row.note
          }))
        },
        cleanup: {
          recent: cleanupLog.map((row: any) => ({
            note: row.note
          }))
        },
        timestamp: new Date().toISOString()
      };
    });

    // Fetch queue depth and job details from Upstash Redis
    let queueMetrics: any = { live: 0, backfill: 0, jobs: [] };
    try {
      const depthData = await depth();
      queueMetrics.live = depthData.live;
      queueMetrics.backfill = depthData.backfill;
      
      // Fetch pending jobs from live queue (peek without removing)
      // Note: This is a simplified version - in production you'd want to peek at the queue
      // For now, we'll just show the queue depth and types
      queueMetrics.jobs = [];
      
      // Add queue processing info
      queueMetrics.processing_info = {
        live_queue: {
          name: "Live (Webhooks)",
          description: "Webhook-driven activity syncs, processed immediately",
          typical_processing_time: "< 5 seconds",
          current_depth: depthData.live
        },
        backfill_queue: {
          name: "Backfill",
          description: "Slower reconciliation jobs, bulk syncs",
          typical_processing_time: "30-60 seconds",
          current_depth: depthData.backfill
        }
      };
    } catch (error) {
      console.error("[Ops Metrics] Failed to fetch queue depth:", error);
      // Continue without queue metrics if Redis is unavailable
    }

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify({
        ...metrics,
        queues: queueMetrics
      })
    };

  } catch (error: any) {
    console.error("[Ops Metrics] Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
}
