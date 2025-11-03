# Subscription-Aware Authentication Enhancement

## Overview
Enhanced backend authentication system to include subscription tier information in all authenticated requests, enabling tier-based rate limiting and feature access control.

## Changes Made

### 1. Enhanced Authentication Module (`netlify/lib/auth.ts`)

#### New Interfaces
```typescript
export type SubscriptionTier = 'free' | 'trial' | 'pro';

export interface AuthResult {
  userId: string;
  athleteId: number;
  subscriptionTier: SubscriptionTier;      // NEW
  subscriptionExpires: Date | null;        // NEW
}
```

#### Tier Limits Configuration
```typescript
export const TIER_LIMITS = {
  free: {
    daysBack: 90,
    maxActivities: 100,
    activitiesPerHour: 60,
    streamsPerHour: 30,
  },
  trial: {
    daysBack: 365,
    maxActivities: 500,
    activitiesPerHour: 300,
    streamsPerHour: 100,
  },
  pro: {
    daysBack: 365,
    maxActivities: 500,
    activitiesPerHour: 300,
    streamsPerHour: 100,
  },
} as const;
```

#### Enhanced `authenticate()` Function
- **Parallel Queries**: Fetches athlete record and subscription data simultaneously for better performance
- **Automatic Expiry Handling**: Checks subscription expiry date and automatically downgrades to 'free' if expired
- **Subscription Resolution**:
  - Queries `user_subscriptions` table for tier information
  - Handles missing subscription records (defaults to 'free')
  - Validates expiry dates and downgrades expired subscriptions
  - Logs tier information for debugging

#### New Helper Function
```typescript
export function getTierLimits(tier: SubscriptionTier)
```
Returns the tier-specific limits for rate limiting and feature control.

### 2. Unit Tests (`tests/unit/auth.test.ts`)

Comprehensive test suite covering:
- ✅ Tier limits validation for all subscription types
- ✅ `getTierLimits()` helper function
- ✅ Missing authorization header handling
- ✅ Invalid authorization format detection
- ✅ Subscription expiry logic verification
- ✅ Type safety checks
- ✅ Tier limits comparison (free < pro/trial)

### 3. Backward Compatibility

**All existing API endpoints remain fully compatible:**
- Functions can destructure only the fields they need: `const { userId, athleteId } = auth`
- New fields (`subscriptionTier`, `subscriptionExpires`) are available but optional
- No breaking changes to existing endpoints

## Authentication Flow

```
1. Client sends: Authorization: Bearer <JWT>
2. Backend validates JWT with Supabase
3. Backend fetches athlete_id from database
4. Backend queries user_subscriptions table
5. Backend checks subscription expiry
6. Returns: { userId, athleteId, subscriptionTier, subscriptionExpires }
```

## Subscription Expiry Logic

```typescript
if (expiresAt) {
  const expiryDate = new Date(expiresAt);
  if (expiryDate > new Date()) {
    // Active subscription
    subscriptionTier = tier;
  } else {
    // Expired - downgrade to free
    subscriptionTier = 'free';
  }
}
```

## Future Usage Examples

### Rate Limiting by Tier
```typescript
const { subscriptionTier } = auth;
const limits = getTierLimits(subscriptionTier);

// Enforce activities per hour limit
if (userRequestCount > limits.activitiesPerHour) {
  return { statusCode: 429, body: 'Rate limit exceeded' };
}
```

### Feature Access Control
```typescript
const { subscriptionTier } = auth;

// Pro/trial users get 365 days, free gets 90 days
const daysBack = Math.min(
  requestedDays,
  getTierLimits(subscriptionTier).daysBack
);
```

### Response Metadata
```typescript
return {
  statusCode: 200,
  body: JSON.stringify({
    data: activities,
    subscription: {
      tier: subscriptionTier,
      expires: subscriptionExpires,
      limits: getTierLimits(subscriptionTier)
    }
  })
};
```

## Testing

### Manual Testing
```bash
# Invalid token (should return 401)
curl -X GET "https://api.veloready.app/api/activities" \
  -H "Authorization: Bearer invalid_token"
# Response: {"error":"Invalid or expired token"}

# Valid token (logs will show tier information)
# Check Netlify function logs for:
# [Auth] ✅ Authenticated user: <id>, athlete: <id>, tier: free
```

### Unit Tests
```bash
npm test tests/unit/auth.test.ts
```

## Performance Considerations

1. **Parallel Queries**: Athlete and subscription data fetched simultaneously (no sequential blocking)
2. **Cached Authentication**: JWT validation is fast (Supabase handles caching)
3. **Minimal Overhead**: Single additional Supabase query per request
4. **No Breaking Changes**: Existing endpoints unaffected

## Database Schema

Requires `user_subscriptions` table with:
- `user_id` (foreign key to auth.users)
- `subscription_tier` ('free' | 'trial' | 'pro')
- `expires_at` (timestamp, nullable)

## Deployment

✅ Deployed to production: https://api.veloready.app
✅ All 27 functions deployed successfully
✅ Backward compatible with existing clients

## Next Steps

1. **Implement Rate Limiting**: Use tier limits in rate limiter middleware
2. **Add Subscription Metadata**: Include tier info in API responses
3. **Feature Gating**: Restrict advanced features to pro tier
4. **Analytics**: Track usage by subscription tier
5. **iOS Integration**: Update app to display tier-specific limits

## Monitoring

Check Netlify function logs for:
- `[Auth] ✅ Authenticated user: <id>, athlete: <id>, tier: <tier>`
- `[Auth] Subscription expired for user <id>, downgrading to free`
- `[Auth] No subscription found for user <id>, defaulting to free`

## Related Files

- `netlify/lib/auth.ts` - Enhanced authentication module
- `tests/unit/auth.test.ts` - Unit tests
- `supabase/migrations/003_subscriptions.sql` - Database schema
- All `netlify/functions/api-*.ts` - Compatible API endpoints
