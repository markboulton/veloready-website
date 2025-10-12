import { Client } from "pg";

/**
 * Get Strava connection status for the authenticated athlete
 * 
 * Returns the connection status and sync progress
 */
export async function handler(event) {
  try {
    // TODO: Get athlete ID from session/auth header
    // For now, return a mock "ready" status
    
    console.log("[Strava Status] Status check requested");
    
    // In production, you would:
    // 1. Get athlete ID from auth
    // 2. Check database for connection status
    // 3. Check if any background sync is in progress
    
    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify({
        connected: true,
        status: "ready" // or "backfilling", "pending", "error"
      })
    };
  } catch (error) {
    console.error("[Strava Status] Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connected: false,
        status: "error",
        error: error.message
      })
    };
  }
}
