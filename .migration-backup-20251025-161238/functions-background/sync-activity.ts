import { budgetOk, consume } from "../lib/rateLimiter";
import { withDb, upsertActivitySummary } from "../lib/db";
import { getActivity, getStreams } from "../lib/strava";

export async function handler(event) {
  const job = JSON.parse(event.body || "{}"); // { athlete_id, activity_id, fetchStreams? }
  const { athlete_id, activity_id, fetchStreams } = job;

  // 1) Budget check for non-upload (read) calls
  if (!(await budgetOk("nonupload", fetchStreams ? 2 : 1))) {
    // Re-signal failure so scheduler can retry later
    return { statusCode: 429, body: "rate-limited: reschedule" };
  }

  // 2) Activity detail
  const activity = await getActivity(athlete_id, activity_id);
  await consume("nonupload", 1);

  // 3) Upsert summary (metadata only - Strava compliant)
  await withDb(async (c) => { await upsertActivitySummary(c, activity); });

  // 4) REMOVED: Stream storage (Strava API compliance)
  // Per Strava API Agreement: Raw stream data cannot be cached >7 days
  // Instead: Use on-demand streams API (/api/request-streams) when needed
  // This approach is fully compliant and reduces storage costs
  
  // Note: If you need derived metrics (zone times, best efforts), compute them here
  // and store in a separate activity_metrics table (allowed by Strava)

  return { statusCode: 200, body: "ok" };
}