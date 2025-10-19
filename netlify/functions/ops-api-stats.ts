import { HandlerEvent } from "@netlify/functions";
import { withDb } from "../lib/db";

/**
 * API and Cache Statistics
 * 
 * Returns metrics about API usage, cache performance, and rate limiting
 */
export async function handler(event: HandlerEvent) {
  try {
    const stats = await withDb(async (c) => {
      // Get activity fetch count from audit log (proxy for API calls)
      const { rows: apiCalls } = await c.query(
        `select 
           count(*) filter (where kind = 'api' and note like '%activities%') as activity_calls,
           count(*) filter (where kind = 'api' and note like '%streams%') as stream_calls,
           count(*) filter (where kind = 'api') as total_calls
         from audit_log 
         where at > now() - interval '24 hours'`
      );

      // Estimate cache performance (activities created within 1 hour of webhook)
      const { rows: cachePerf } = await c.query(
        `select 
           count(*) as total_activities,
           count(*) filter (where created_at - start_date < interval '1 hour') as likely_cached,
           count(*) filter (where created_at - start_date > interval '1 hour') as likely_fetched
         from activity 
         where created_at > now() - interval '24 hours'`
      );

      return {
        api: {
          last_24h: {
            total_calls: parseInt(apiCalls[0]?.total_calls || "0"),
            activity_calls: parseInt(apiCalls[0]?.activity_calls || "0"),
            stream_calls: parseInt(apiCalls[0]?.stream_calls || "0")
          },
          rate_limit_status: "OK", // Could integrate with Strava API headers
          estimated_daily_usage: parseInt(apiCalls[0]?.total_calls || "0"), // Simple estimate
          strava_limit: 1000, // 600 requests per 15 min = ~1000 per day conservatively
          usage_percentage: Math.min(100, (parseInt(apiCalls[0]?.total_calls || "0") / 1000) * 100).toFixed(1)
        },
        cache: {
          estimated_hit_rate: cachePerf[0] ? 
            ((parseInt(cachePerf[0].likely_cached) / parseInt(cachePerf[0].total_activities)) * 100).toFixed(1) : "0",
          activities_cached: parseInt(cachePerf[0]?.likely_cached || "0"),
          activities_fetched: parseInt(cachePerf[0]?.likely_fetched || "0"),
          edge_cache_ttl: "1 hour",
          backend_cache_ttl: "24 hours (streams)"
        },
        optimization_impact: {
          pre_optimization_estimate: 8500, // From docs: before optimization
          current_calls: parseInt(apiCalls[0]?.total_calls || "0"),
          reduction_percentage: ((1 - parseInt(apiCalls[0]?.total_calls || "0") / 8500) * 100).toFixed(1)
        },
        timestamp: new Date().toISOString()
      };
    });

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify(stats)
    };

  } catch (error: any) {
    console.error("[API Stats] Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message })
    };
  }
}
