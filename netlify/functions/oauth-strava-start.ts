import { HandlerEvent } from "@netlify/functions";
import { enforceRateLimit, RateLimitPresets } from "../lib/clientRateLimiter";

/**
 * Strava OAuth Start Endpoint
 *
 * Redirects to Strava's authorization page.
 * The state parameter is generated and validated by the iOS app.
 *
 * Query params:
 *   - state: CSRF token from app
 *   - redirect: Callback URL (should be /oauth/strava/callback)
 */
export async function handler(event: HandlerEvent) {
  // Rate limiting: 10 requests per minute (prevent OAuth abuse)
  const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.OAUTH);
  if (rateLimitResponse) return rateLimitResponse;


  const url = new URL(event.rawUrl);
  const state = url.searchParams.get("state");
  const redirect = url.searchParams.get("redirect") || "https://veloready.app/oauth/strava/callback";

  console.log(`[Strava OAuth Start] State: ${state?.substring(0, 8)}...`);
  console.log(`[Strava OAuth Start] Redirect URI: ${redirect}`);

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirect,
    response_type: "code",
    scope: "read,activity:read_all,activity:write",
    state: state || "",
  });

  return {
    statusCode: 302,
    headers: { 
      Location: `https://www.strava.com/oauth/authorize?${params}`,
      "Cache-Control": "no-cache"
    },
  };
}