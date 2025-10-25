import { HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { withDb } from "./db";

/**
 * Authentication helper for Netlify Functions
 * 
 * Extracts and validates JWT tokens from Supabase Auth
 * Returns authenticated user_id and athlete_id
 */

export interface AuthResult {
  userId: string;
  athleteId: number;
}

export interface AuthError {
  statusCode: number;
  error: string;
}

/**
 * Extract and validate authentication from request headers
 * 
 * @param event - Netlify function event
 * @returns AuthResult with userId and athleteId, or AuthError
 * 
 * @example
 * const auth = await authenticate(event);
 * if ('error' in auth) {
 *   return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
 * }
 * const { userId, athleteId } = auth;
 */
export async function authenticate(event: HandlerEvent): Promise<AuthResult | AuthError> {
  try {
    // Extract Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    
    if (!authHeader) {
      return {
        statusCode: 401,
        error: "Missing authorization header"
      };
    }

    // Extract Bearer token
    const token = authHeader.replace(/^Bearer\s+/i, '');
    
    if (!token || token === authHeader) {
      return {
        statusCode: 401,
        error: "Invalid authorization format (expected 'Bearer <token>')"
      };
    }

    // Validate as Supabase JWT
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

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[Auth] Token validation failed:", authError?.message);
      return {
        statusCode: 401,
        error: "Invalid or expired token"
      };
    }

    // Fetch athlete record by user_id
    const athlete = await withDb(async (db) => {
      const { rows } = await db.query(
        `SELECT id FROM athlete WHERE user_id = $1`,
        [user.id]
      );
      return rows[0] || null;
    });

    if (!athlete) {
      console.error(`[Auth] No athlete found for user_id: ${user.id}`);
      return {
        statusCode: 404,
        error: "Athlete profile not found. Please complete Strava authentication."
      };
    }

    console.log(`[Auth] ✅ Authenticated user: ${user.id}, athlete: ${athlete.id}`);

    return {
      userId: user.id,
      athleteId: athlete.id
    };

  } catch (error: any) {
    console.error("[Auth] Authentication error:", error);
    return {
      statusCode: 500,
      error: "Authentication failed"
    };
  }
}

/**
 * Optional authentication - returns null if no auth header present
 * Useful for endpoints that work with or without authentication
 * 
 * @param event - Netlify function event
 * @returns AuthResult or null if no auth header
 */
export async function optionalAuth(event: HandlerEvent): Promise<AuthResult | null> {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  if (!authHeader) {
    return null;
  }

  const result = await authenticate(event);
  
  if ('error' in result) {
    return null;
  }

  return result;
}
