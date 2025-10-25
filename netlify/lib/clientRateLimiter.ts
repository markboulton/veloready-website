import { HandlerEvent } from "@netlify/functions";
import { get, setex, incrby } from "./redis";

/**
 * Client Rate Limiter for VeloReady API Endpoints
 *
 * Protects against abuse by limiting requests per client (by IP address or user ID).
 * Uses Redis for distributed rate limiting across serverless function instances.
 *
 * Different from lib/rateLimiter.ts which tracks Strava API usage.
 *
 * Usage:
 * ```typescript
 * export async function handler(event: HandlerEvent) {
 *   const limited = await checkRateLimit(event, { maxRequests: 60, windowSeconds: 60 });
 *   if (limited) {
 *     return {
 *       statusCode: 429,
 *       headers: {
 *         "Content-Type": "application/json",
 *         "Retry-After": "60"
 *       },
 *       body: JSON.stringify({
 *         error: "Too many requests",
 *         message: "Rate limit exceeded. Please try again later."
 *       })
 *     };
 *   }
 *   // ... rest of handler
 * }
 * ```
 */

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   * Default: 60 requests
   */
  maxRequests: number;

  /**
   * Time window in seconds
   * Default: 60 seconds (1 minute)
   */
  windowSeconds: number;

  /**
   * Optional: Identify client by user ID instead of IP
   * Useful for authenticated endpoints
   */
  useUserId?: boolean;
}

export interface RateLimitResult {
  /**
   * Whether the request should be rate limited (true = reject request)
   */
  limited: boolean;

  /**
   * Current request count in the time window
   */
  currentCount: number;

  /**
   * Maximum requests allowed
   */
  limit: number;

  /**
   * Remaining requests in the current window
   */
  remaining: number;

  /**
   * Seconds until the rate limit window resets
   */
  resetInSeconds: number;
}

/**
 * Extract client identifier from request
 *
 * Priority:
 * 1. User ID from authentication (if useUserId is true)
 * 2. X-Forwarded-For header (Netlify/CDN provides real client IP)
 * 3. Fallback to "unknown"
 *
 * @param event Netlify function event
 * @param useUserId Whether to try extracting user ID
 * @returns Client identifier string
 */
function getClientId(event: HandlerEvent, useUserId: boolean = false): string {
  // Option 1: Use authenticated user ID (most accurate)
  if (useUserId) {
    // Try to extract user ID from Authorization header
    // This requires the token to be parsed, which is expensive
    // For now, we'll use IP-based limiting for simplicity
    // Future enhancement: Parse JWT and use user.id
  }

  // Option 2: Use client IP address
  const forwardedFor = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  if (forwardedFor) {
    // X-Forwarded-For may contain multiple IPs (client, proxy1, proxy2...)
    // Take the first one (original client)
    return forwardedFor.split(',')[0].trim();
  }

  // Option 3: Fallback (should rarely happen in Netlify)
  return 'unknown';
}

/**
 * Check if a client has exceeded the rate limit
 *
 * @param event Netlify function event
 * @param config Rate limit configuration
 * @returns RateLimitResult with limit status and metadata
 *
 * @example
 * ```typescript
 * const result = await checkRateLimit(event, {
 *   maxRequests: 100,
 *   windowSeconds: 60
 * });
 *
 * if (result.limited) {
 *   return {
 *     statusCode: 429,
 *     headers: {
 *       "X-RateLimit-Limit": result.limit.toString(),
 *       "X-RateLimit-Remaining": result.remaining.toString(),
 *       "X-RateLimit-Reset": result.resetInSeconds.toString(),
 *       "Retry-After": result.resetInSeconds.toString()
 *     },
 *     body: JSON.stringify({ error: "Rate limit exceeded" })
 *   };
 * }
 * ```
 */
export async function checkRateLimit(
  event: HandlerEvent,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { maxRequests, windowSeconds, useUserId } = config;

  // Get client identifier
  const clientId = getClientId(event, useUserId);

  // Redis key for this client's rate limit counter
  const key = `client_ratelimit:${clientId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

  // Get current count
  const currentCountStr = await get(key);
  const currentCount = parseInt(currentCountStr || '0', 10);

  // Check if limit exceeded
  if (currentCount >= maxRequests) {
    return {
      limited: true,
      currentCount,
      limit: maxRequests,
      remaining: 0,
      resetInSeconds: windowSeconds
    };
  }

  // Increment counter
  await incrby(key, 1);

  // Set expiry on first request in this window
  if (currentCount === 0) {
    await setex(key, windowSeconds, '1');
  }

  // Calculate remaining requests
  const remaining = maxRequests - (currentCount + 1);

  return {
    limited: false,
    currentCount: currentCount + 1,
    limit: maxRequests,
    remaining: Math.max(0, remaining),
    resetInSeconds: windowSeconds
  };
}

/**
 * Rate limit presets for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict: 30 requests per minute
   * Use for: Expensive operations, external API calls
   */
  STRICT: { maxRequests: 30, windowSeconds: 60 },

  /**
   * Standard: 60 requests per minute
   * Use for: Normal API endpoints
   */
  STANDARD: { maxRequests: 60, windowSeconds: 60 },

  /**
   * Generous: 120 requests per minute
   * Use for: High-traffic endpoints, authenticated users
   */
  GENEROUS: { maxRequests: 120, windowSeconds: 60 },

  /**
   * OAuth: 10 requests per minute
   * Use for: Authentication endpoints to prevent brute force
   */
  OAUTH: { maxRequests: 10, windowSeconds: 60 },

  /**
   * Webhooks: 100 requests per minute
   * Use for: External webhook endpoints (Strava, etc.)
   */
  WEBHOOKS: { maxRequests: 100, windowSeconds: 60 }
};

/**
 * Convenience function to apply rate limiting and return 429 response
 *
 * @param event Netlify function event
 * @param config Rate limit configuration
 * @returns 429 response if limited, null if OK to proceed
 *
 * @example
 * ```typescript
 * export async function handler(event: HandlerEvent) {
 *   const rateLimitResponse = await enforceRateLimit(event, RateLimitPresets.STANDARD);
 *   if (rateLimitResponse) return rateLimitResponse;
 *
 *   // ... rest of handler logic
 * }
 * ```
 */
export async function enforceRateLimit(
  event: HandlerEvent,
  config: RateLimitConfig
): Promise<{ statusCode: number; headers: Record<string, string>; body: string } | null> {
  const result = await checkRateLimit(event, config);

  if (result.limited) {
    return {
      statusCode: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": result.resetInSeconds.toString(),
        "Retry-After": result.resetInSeconds.toString()
      },
      body: JSON.stringify({
        error: "Too many requests",
        message: `Rate limit exceeded. Maximum ${result.limit} requests per ${config.windowSeconds} seconds.`,
        retryAfter: result.resetInSeconds
      })
    };
  }

  return null;
}
