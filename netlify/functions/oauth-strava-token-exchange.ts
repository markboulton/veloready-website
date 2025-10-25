import fetch from "node-fetch";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { HandlerEvent } from "@netlify/functions";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";

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
export async function handler(event: HandlerEvent) {
  // Rate limiting: 10 requests per minute (prevent OAuth abuse)
  const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.OAUTH);
  if (rateLimitResponse) return rateLimitResponse;


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

    // Create Supabase client with service role (can bypass RLS)
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create or get Supabase user using Strava athlete ID
    const email = `strava-${data.athlete.id}@veloready.app`;
    const password = `strava-${data.athlete.id}-${process.env.STRAVA_CLIENT_SECRET}`; // Deterministic password

    console.log(`[Strava Token Exchange] Creating/signing in Supabase user for ${email}`);
    
    // Try to sign in first (user might already exist)
    let userId: string;
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      // User doesn't exist, create them
      console.log(`[Strava Token Exchange] User doesn't exist, creating new user`);
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          strava_athlete_id: data.athlete.id,
          provider: 'strava'
        }
      });

      if (createError) {
        console.error(`[Strava Token Exchange] Failed to create user:`, createError);
        throw new Error(`Failed to create user: ${createError.message}`);
      }

      userId = createData.user.id;
      console.log(`[Strava Token Exchange] Created new user: ${userId}`);
    } else {
      userId = signInData.user.id;
      console.log(`[Strava Token Exchange] Signed in existing user: ${userId}`);
    }

    // Store credentials in database with user_id
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    
    await db.query(
      `INSERT INTO athlete (id, user_id, scopes, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
       ON CONFLICT (id) DO UPDATE 
       SET user_id=$2, access_token=$4, refresh_token=$5, expires_at=to_timestamp($6), scopes=$3`,
      [
        data.athlete.id,
        userId,
        data.scope?.split(",") || [],
        data.access_token,
        data.refresh_token,
        data.expires_at
      ]
    );
    
    await db.end();
    console.log(`[Strava Token Exchange] Credentials stored for athlete ${data.athlete.id} with user_id ${userId}`);

    // Sign in the user to get a session token for the iOS app
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    let accessToken = null;
    let refreshToken = null;
    let expiresIn = 3600;

    if (sessionError) {
      console.error(`[Strava Token Exchange] Failed to create session:`, sessionError);
      // Continue anyway - app can still work with athlete_id
    } else if (sessionData?.session) {
      accessToken = sessionData.session.access_token;
      refreshToken = sessionData.session.refresh_token;
      expiresIn = sessionData.session.expires_in || 3600;
      console.log(`[Strava Token Exchange] Session created for iOS app (expires in ${expiresIn}s)`);
    }

    // Redirect to iOS app with tokens as query parameters
    const redirectParams = new URLSearchParams({
      ok: "1",
      athlete_id: data.athlete.id.toString(),
      user_id: userId,
      state: state || "",
      ...(accessToken && { access_token: accessToken }),
      ...(refreshToken && { refresh_token: refreshToken }),
      expires_in: expiresIn.toString()
    });
    
    const redirectURL = `veloready://oauth/strava/done?${redirectParams.toString()}`;
    console.log(`[Strava Token Exchange] Redirecting to iOS app: ${redirectURL.substring(0, 100)}...`);
    
    return {
      statusCode: 302,
      headers: {
        "Location": redirectURL,
        "Content-Type": "text/html"
      },
      body: `<html><body>Redirecting to app...</body></html>`
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