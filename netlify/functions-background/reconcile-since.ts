import { budgetOk, consume } from "../lib/rateLimiter";
import { listActivitiesSince } from "../lib/strava";
import { withDb, upsertActivitySummary } from "../lib/db";

export async function handler(event) {
  const { athlete_id, since_iso } = JSON.parse(event.body || "{}");
  const after = Math.floor(new Date(since_iso).getTime()/1000);

  if (!(await budgetOk("nonupload", 1))) return { statusCode: 202, body: "pause" };
  const items = await listActivitiesSince(athlete_id, after, 1, 200);
  await consume("nonupload", 1);
  await withDb(async (c) => Promise.all(items.map(a => upsertActivitySummary(c, a))));

  return { statusCode: 200, body: "reconcile done" };
}