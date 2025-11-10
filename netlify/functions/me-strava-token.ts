import { Client } from "pg";
import { HandlerEvent } from "@netlify/functions";
import { authenticate } from "../lib/auth";

/**
 * Get Strava access token for the authenticated athlete
 * 
 * Returns the access token if valid, or refreshes it if expired
 * 
 * Requires Supabase JWT authentication
 * 
 * @returns Access token or error
 */
export async function handler(event: HandlerEvent) {
  try {
    // Authenticate request using Supabase JWT
    const auth = await authenticate(event);
    
    if ('error' in auth) {
      console.error(`[Strava Token] Authentication failed: ${auth.error}`);
      return {
        statusCode: auth.statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: auth.error })
      };
    }
    
    const { athleteId } = auth;
    console.log(`[Strava Token] Token requested for authenticated athlete ${athleteId}`);
    
    // Connect to database
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    
    // Get athlete's Strava credentials
    const result = await db.query(
      `SELECT access_token, refresh_token, expires_at 
       FROM athlete 
       WHERE id = $1`,
      [athleteId]
    );
    
    if (result.rows.length === 0) {
      await db.end();
      console.error(`[Strava Token] No credentials found for athlete ${athleteId}`);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Not connected to Strava"
        })
      };
    }
    
    const { access_token, refresh_token, expires_at } = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(expires_at);
    
    // Check if token is still valid (with 5-minute buffer)
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (expiresAt.getTime() - now.getTime() > bufferMs) {
      await db.end();
      console.log(`[Strava Token] Returning valid token (expires in ${Math.round((expiresAt.getTime() - now.getTime()) / 60000)}min)`);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: access_token
        })
      };
    }
    
    // Token expired - refresh it
    console.log(`[Strava Token] Token expired, refreshing...`);
    
    const refreshResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID!,
        client_secret: process.env.STRAVA_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refresh_token
      })
    });
    
    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      await db.end();
      console.error(`[Strava Token] Refresh failed: ${refreshResponse.status} - ${errorText}`);
      return {
        statusCode: refreshResponse.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Token refresh failed: ${errorText}`
        })
      };
    }
    
    const refreshData: any = await refreshResponse.json();
    console.log(`[Strava Token] Token refreshed successfully`);
    
    // Update database with new token
    await db.query(
      `UPDATE athlete 
       SET access_token = $1, refresh_token = $2, expires_at = to_timestamp($3)
       WHERE id = $4`,
      [
        refreshData.access_token,
        refreshData.refresh_token,
        refreshData.expires_at,
        athleteId
      ]
    );
    
    await db.end();
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: refreshData.access_token
      })
    };
    
  } catch (error) {
    console.error("[Strava Token] Exception:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message || "Internal server error"
      })
    };
  }
}
