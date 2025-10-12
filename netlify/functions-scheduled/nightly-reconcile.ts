import { withDb } from "../lib/db";
import { ENV } from "../lib/env";

export async function handler() {
  // Simple scan: enqueue a small reconcile for every athlete since yesterday
  const yesterday = new Date(Date.now() - 24*3600*1000).toISOString();

  const { default: fetch } = await import("node-fetch"); // netlify bundler usually polyfills fetch, this is safe fallback
  const url = `${ENV.APP_BASE_URL}/.netlify/functions-background/reconcile-since`;

  await withDb(async (c) => {
    const { rows } = await c.query(`select id from athlete limit 2000`); // cap
    await Promise.all(rows.map((r: any) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: r.id, since_iso: yesterday }) })
    ));
  });

  return { statusCode: 200, body: "nightly enqueued" };
}