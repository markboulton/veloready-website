import { HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { withDb } from "./db-pooled";

/**
 * Authentication helper for Netlify Functions
 * 
 * Extracts and validates JWT tokens from Supabase Auth
 * Returns authenticated user_id, athlete_id, and subscription tier information
 */

// Subscription tier type
export type SubscriptionTier = 'free' | 'trial' | 'pro';

// Tier limits configuration
export const TIER_LIMITS = {
  free: {
    daysBack: 90,
    maxActivities: 100,
    activitiesPerHour: 60,
    streamsPerHour: 30,
    rateLimitPerHour: 100, // 100 requests per hour (allows ~15 on startup + normal usage)
  },
  trial: {
    daysBack: 365,
    maxActivities: 500,
    activitiesPerHour: 300,
    streamsPerHour: 100,
    rateLimitPerHour: 300, // 300 requests per hour
  },
  pro: {
    daysBack: 365,
    maxActivities: 500,
    activitiesPerHour: 300,
    streamsPerHour: 100,
    rateLimitPerHour: 300, // 300 requests per hour
  },
} as const;

export interface AuthResult {
  userId: string;
  athleteId: number;
  subscriptionTier: SubscriptionTier;
  subscriptionExpires: Date | null;
}

export interface AuthError {
  statusCode: number;
  error: string;
}

/**
 * Get tier limits for a given subscription tier
 * @param tier - Subscription tier
 * @returns Tier limits configuration
 */
export function getTierLimits(tier: SubscriptionTier) {
  return TIER_LIMITS[tier];
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

    // Validate JWT using service role key for full access
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!,
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

    // Fetch athlete record and subscription in parallel
    const [athlete, subscription] = await Promise.all([
      withDb(async (db) => {
        const { rows } = await db.query(
          `SELECT id FROM athlete WHERE user_id = $1`,
          [user.id]
        );
        return rows[0] || null;
      }),
      // Query subscription from Supabase
      supabase
        .from('user_subscriptions')
        .select('subscription_tier, expires_at')
        .eq('user_id', user.id)
        .single()
    ]);

    if (!athlete) {
      console.error(`[Auth] No athlete found for user_id: ${user.id}`);
      return {
        statusCode: 404,
        error: "Athlete profile not found. Please complete Strava authentication."
      };
    }

    // Determine subscription tier
    let subscriptionTier: SubscriptionTier = 'free';
    let subscriptionExpires: Date | null = null;

    if (subscription.data && !subscription.error) {
      const tier = subscription.data.subscription_tier as SubscriptionTier;
      const expiresAt = subscription.data.expires_at;

      // Check if subscription has expired
      if (expiresAt) {
        const expiryDate = new Date(expiresAt);
        subscriptionExpires = expiryDate;
        
        if (expiryDate > new Date()) {
          // Subscription is still active
          subscriptionTier = tier;
        } else {
          // Subscription expired, downgrade to free
          console.log(`[Auth] Subscription expired for user ${user.id}, downgrading to free`);
          subscriptionTier = 'free';
          subscriptionExpires = null;
        }
      } else {
        // No expiry (lifetime or free tier)
        subscriptionTier = tier;
      }
    } else {
      // No subscription record found, default to free
      console.log(`[Auth] No subscription found for user ${user.id}, defaulting to free`);
    }

    console.log(`[Auth] ✅ Authenticated user: ${user.id}, athlete: ${athlete.id}, tier: ${subscriptionTier}`);

    return {
      userId: user.id,
      athleteId: athlete.id,
      subscriptionTier,
      subscriptionExpires
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
