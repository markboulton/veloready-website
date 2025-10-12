import { popLive, popBackfill } from "../lib/queue";
import { ENV } from "../lib/env";

async function invokeBackground(name: string, payload: any) {
  // Call your own Background Function endpoint
  const url = `${ENV.APP_BASE_URL}/.netlify/functions-background/${name}`;
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export async function handler() {
  // Drain more live than backfill each tick
  let processed = 0;

  // Live queue
  for (let i = 0; i < 10; i++) {
    const job = await popLive();
    if (!job) break;
    if (job.kind === "sync-activity") {
      await invokeBackground("sync-activity", job);
    } else if (job.kind === "delete-activity") {
      // TODO: add delete handler if you want to hard-delete locally
    } else if (job.kind === "deauth") {
      // TODO: revoke + cleanup tokens for athlete_id
    }
    processed++;
  }

  // Backfill queue
  for (let i = 0; i < 3; i++) {
    const job = await popBackfill();
    if (!job) break;
    if (job.kind === "backfill-athlete") {
      await invokeBackground("backfill-athlete", job);
    } else if (job.kind === "reconcile-since") {
      await invokeBackground("reconcile-since", job);
    }
    processed++;
  }

  return { statusCode: 200, body: `drained: ${processed}` };
}