import fetch from "node-fetch";
import { Client } from "pg";

/**
 * Strava Token Exchange Endpoint
 * 
 * Called by the HTML callback page after receiving the OAuth code from Strava.
 * Exchanges the code for an access token and stores it in the database.
 * 
 * Query params:
 *   - code: OAuth authorization code from Strava
 *   - state: CSRF token (optional - already validated by app)
 * 
 * Returns:
 *   { "ok": 1, "athlete_id": "12345" } on success
 *   { "ok": 0, "error": "message" } on failure
 */
export async function handler(event) {
  try {
    // Extract code and state from query params
    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    console.log(`[Strava Token Exchange] Received request with state: ${state?.substring(0, 8)}...`);

    if (!code) {
      console.error("[Strava Token Exchange] No code provided");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: 0, error: "Missing authorization code" })
      };
    }

    // Exchange code for token with Strava
    console.log("[Strava Token Exchange] Exchanging code for token...");
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID!,
        client_secret: process.env.STRAVA_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Strava Token Exchange] Strava API error: ${res.status} - ${errorText}`);
      return {
        statusCode: res.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: 0, error: `Strava API error: ${errorText}` })
      };
    }

    const data: any = await res.json();
    console.log(`[Strava Token Exchange] Token received for athlete ${data.athlete.id}`);

    // Store credentials in database
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    
    await db.query(
      `INSERT INTO athlete (id, scopes, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5))
       ON CONFLICT (id) DO UPDATE 
       SET access_token=$3, refresh_token=$4, expires_at=to_timestamp($5), scopes=$2`,
      [
        data.athlete.id,
        data.scope?.split(",") || [],
        data.access_token,
        data.refresh_token,
        data.expires_at
      ]
    );
    
    await db.end();
    console.log(`[Strava Token Exchange] Credentials stored for athlete ${data.athlete.id}`);

    // Return success with athlete ID
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: 1,
        athlete_id: data.athlete.id.toString()
      })
    };

  } catch (error) {
    console.error("[Strava Token Exchange] Exception:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: 0, error: error.message || "Internal server error" })
    };
  }
}