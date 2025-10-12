import { Client } from "pg";
import { ENV } from "./env";

export async function withDb<T>(fn: (c: Client) => Promise<T>) {
  const client = new Client({ connectionString: ENV.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

export async function upsertActivitySummary(c: Client, a: any) {
  await c.query(`
    insert into activity (id, athlete_id, start_date, type, distance_m, moving_time_s, total_elevation_gain_m,
                          average_watts, average_heartrate, max_heartrate, private, visibility, created_at, updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), now())
    on conflict (id) do update set
      type=excluded.type,
      distance_m=excluded.distance_m,
      moving_time_s=excluded.moving_time_s,
      total_elevation_gain_m=excluded.total_elevation_gain_m,
      average_watts=excluded.average_watts,
      average_heartrate=excluded.average_heartrate,
      max_heartrate=excluded.max_heartrate,
      private=excluded.private,
      visibility=excluded.visibility,
      updated_at=now()
  `, [
    a.id, a.athlete.id, a.start_date, a.type, a.distance, a.moving_time,
    a.total_elevation_gain, a.average_watts, a.average_heartrate, a.max_heartrate,
    a.private, a.visibility
  ]);
}

export async function getAthlete(c: Client, athleteId: number) {
  const { rows } = await c.query(`select * from athlete where id = $1`, [athleteId]);
  return rows[0] ?? null;
}

export async function saveTokens(c: Client, athleteId: number, access: string, refresh: string, expiresAtSec: number, scopes: string[]) {
  await c.query(`
    insert into athlete (id, scopes, access_token, refresh_token, expires_at, created_at, updated_at)
    values ($1,$2,$3,$4, to_timestamp($5), now(), now())
    on conflict (id) do update set
      scopes=$2, access_token=$3, refresh_token=$4, expires_at=to_timestamp($5), updated_at=now()
  `, [athleteId, scopes, access, refresh, expiresAtSec]);
}