import { HandlerEvent } from "@netlify/functions";

export interface AuthResult {
  userId: string;
  athleteId: number;
}

export interface AuthError {
  statusCode: number;
  error: string;
}

/**
 * Mock authentication for testing
 * This completely bypasses the real auth module to avoid database connections
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

    // For testing, accept any valid Bearer token or test tokens
    if (token === 'test-token' || token === 'mock-access-token' || token.startsWith('Bearer ')) {
      return {
        userId: 'test-user-id',
        athleteId: 123456789
      };
    }

    return {
      statusCode: 401,
      error: "Invalid or expired token"
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
