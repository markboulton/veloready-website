import { HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";

/**
 * Refresh Supabase JWT Token
 * 
 * Accepts a refresh token and returns a new access token
 * 
 * POST body:
 *   { "refresh_token": "..." }
 * 
 * Returns:
 *   { "access_token": "...", "refresh_token": "...", "expires_in": 3600 }
 */
export async function handler(event: HandlerEvent) {
  // Rate limiting: 30 requests per minute
  const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.STANDARD);
  if (rateLimitResponse) return rateLimitResponse;

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing refresh_token" })
      };
    }

    console.log("[Auth Refresh] Refreshing Supabase token...");

    // Create Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session) {
      console.error("[Auth Refresh] Failed to refresh token:", error?.message);
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid or expired refresh token" })
      };
    }

    console.log("[Auth Refresh] ✅ Token refreshed successfully");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in || 3600
      })
    };

  } catch (error: any) {
    console.error("[Auth Refresh] Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Internal server error" })
    };
  }
}
