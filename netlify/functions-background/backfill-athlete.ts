import { budgetOk, consume } from "../lib/rateLimiter";
import { listActivitiesSince } from "../lib/strava";
import { withDb, upsertActivitySummary } from "../lib/db";

export async function handler(event) {
  const { athlete_id, window_days = 90 } = JSON.parse(event.body || "{}");
  const after = Math.floor((Date.now() - window_days * 24 * 3600 * 1000) / 1000);

  let page = 1;
  while (true) {
    if (!(await budgetOk("nonupload", 1))) return { statusCode: 202, body: `pause, resume page ${page}` };
    const items = await listActivitiesSince(athlete_id, after, page, 200);
    await consume("nonupload", 1);
    if (!items || items.length === 0) break;
    await withDb(async (c) => Promise.all(items.map(a => upsertActivitySummary(c, a))));
    page++;
  }

  return { statusCode: 200, body: "backfill complete or paused" };
}