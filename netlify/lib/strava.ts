import { ENV } from "./env";
import { withDb, getAthlete, saveTokens } from "./db-pooled";
import { getStore } from "@netlify/blobs";
import { PoolClient } from "pg";

const blobStore = getStore("strava-cache");

type Tokens = { access_token: string; refresh_token: string; expires_at: number; };

async function refreshTokens(c: PoolClient, athleteId: number, refreshToken: string): Promise<Tokens> {
  const body = new URLSearchParams({
    client_id: ENV.STRAVA_CLIENT_ID,
    client_secret: ENV.STRAVA_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const res = await fetch("https://www.strava.com/oauth/token", { method: "POST", body });
  const data = await res.json();
  await saveTokens(c, athleteId, data.access_token, data.refresh_token, data.expires_at, []);
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at };
}

/**
 * Log API call to audit_log for tracking metrics
 */
async function logApiCall(athleteId: number, endpoint: string): Promise<void> {
  try {
    await withDb(async (c) => {
      // Get user_id from athlete for RLS compliance
      const { rows } = await c.query(`SELECT user_id FROM athlete WHERE id = $1`, [athleteId]);
      const userId = rows[0]?.user_id || null;

      await c.query(
        `INSERT INTO audit_log(kind, ref_id, note, athlete_id, user_id) VALUES ($1, $2, $3, $4, $5)`,
        ['api', String(athleteId), endpoint, athleteId, userId]
      );
    });
  } catch (error) {
    console.error(`[Strava API] Failed to log API call to audit_log:`, error);
    // Don't throw - logging failures shouldn't break API calls
  }
}

export async function withStravaAccess<T>(athleteId: number, fn: (token: string) => Promise<T>) {
  return withDb(async (c) => {
    const athlete = await getAthlete(c, athleteId);
    if (!athlete) throw new Error("Athlete not found");
    const now = Math.floor(Date.now()/1000);
    let access = athlete.access_token;
    let refresh = athlete.refresh_token;
    let exp = Math.floor(new Date(athlete.expires_at).getTime()/1000);
    if (exp - now < 3600) {
      const t = await refreshTokens(c, athleteId, refresh);
      access = t.access_token; refresh = t.refresh_token; exp = t.expires_at;
    }
    return fn(access);
  });
}

export async function getActivity(athleteId: number, activityId: number) {
  const result = await withStravaAccess(athleteId, async (token) => {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      await logApiCall(athleteId, 'activities');
    }
    return res.json();
  });
  return result;
}

export async function getStreams(athleteId: number, activityId: number) {
  const result = await withStravaAccess(athleteId, async (token) => {
    const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,latlng,altitude,heartrate,cadence,watts&key_by_type=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    if (res.ok) {
      await logApiCall(athleteId, 'streams');
    }
    return res.json();
  });
  return result;
}

export async function listActivitiesSince(athleteId: number, afterEpochSec: number, page: number, perPage = 200) {
  // Cache key: activities:{athleteId}:{afterEpochSec}:{page}
  // Cache for 1 hour to prevent repeated API calls from iOS app
  const cacheKey = `activities:${athleteId}:${afterEpochSec}:${page}`;
  
  try {
    // Check cache first
    const cached = await blobStore.get(cacheKey, { type: "text" });
    if (cached) {
      console.log(`[Strava Cache] HIT for activities:list (athleteId=${athleteId}, after=${afterEpochSec})`);
      return JSON.parse(cached);
    }
    console.log(`[Strava Cache] MISS for activities:list (athleteId=${athleteId}, after=${afterEpochSec})`);
  } catch (e) {
    // Cache miss or error, proceed to fetch from Strava
    console.log(`[Strava Cache] ERROR: ${e}`);
  }
  
  const result = await withStravaAccess(athleteId, async (token) => {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpochSec}&page=${page}&per_page=${perPage}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    if (res.ok) {
      await logApiCall(athleteId, 'activities:list');
      
      // Cache the result for 1 hour
      const data = await res.json();
      try {
        await blobStore.set(cacheKey, JSON.stringify(data), { metadata: { ttl: 3600 } });
      } catch (e) {
        // Cache write failed, but we still have the data
        console.error(`[Strava] Failed to cache activities list: ${e}`);
      }
      
      return data;
    }
    return res.json();
  });
  return result;
}