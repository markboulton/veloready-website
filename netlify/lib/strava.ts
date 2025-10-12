import { ENV } from "./env";
import { withDb, getAthlete, saveTokens } from "./db";
import { Client } from "pg";

type Tokens = { access_token: string; refresh_token: string; expires_at: number; };

async function refreshTokens(c: Client, athleteId: number, refreshToken: string): Promise<Tokens> {
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
  return withStravaAccess(athleteId, async (token) => {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  });
}

export async function getStreams(athleteId: number, activityId: number) {
  return withStravaAccess(athleteId, async (token) => {
    const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,latlng,altitude,heartrate,cadence,watts&key_by_type=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    return res.json();
  });
}

export async function listActivitiesSince(athleteId: number, afterEpochSec: number, page: number, perPage = 200) {
  return withStravaAccess(athleteId, async (token) => {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpochSec}&page=${page}&per_page=${perPage}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    return res.json();
  });
}