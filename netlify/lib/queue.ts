import { rpush, lpop, llen } from "./redis";

export const Q = {
  LIVE: "q:live",         // webhook-driven: sync-activity
  BACKFILL: "q:backfill"  // slower windows + reconciles
};

export async function enqueueLive(job: any) { return rpush(Q.LIVE, job); }
export async function enqueueBackfill(job: any) { return rpush(Q.BACKFILL, job); }
export async function popLive() { return lpop(Q.LIVE); }
export async function popBackfill() { return lpop(Q.BACKFILL); }
export async function depth() { return { live: await llen(Q.LIVE), backfill: await llen(Q.BACKFILL) }; }