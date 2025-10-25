# Authentication Fix Summary

## Problem Identified

After adding API call logging, the backend endpoints (`api-activities.ts`, `api-streams.ts`) were updated to require authentication via JWT tokens. However, the iOS app does not send authentication headers, causing all Strava API requests to fail with `notAuthenticated` errors.

### Root Cause

1. **Backend Change**: Added `authenticate(event)` to API endpoints to enforce user authentication
2. **iOS App Gap**: `VeloReadyAPIClient.swift` line 121-122 shows TODO comment - no auth headers being sent
3. **Result**: Backend returns 401 Unauthorized → iOS app shows `notAuthenticated` errors

### Error Flow

```
iOS App → VeloReady API (no auth header)
         ↓
Backend authenticate() → Missing authorization header
         ↓
Return 401 Unauthorized
         ↓
iOS App → VeloReadyAPIError.notAuthenticated
```

## Solution Implemented (TEMPORARY)

Made authentication **optional** for iOS app compatibility while proper Supabase integration is implemented.

### Changes Made

**1. `netlify/functions/api-activities.ts`**
```typescript
// Before (required auth):
const auth = await authenticate(event);
if ('error' in auth) {
  return { statusCode: auth.statusCode, ... };
}

// After (optional auth with fallback):
const auth = await optionalAuth(event);
const athleteId = auth?.athleteId || 104662;  // Fallback to hardcoded
const userId = auth?.userId || null;

if (!auth) {
  console.log(`⚠️ Using hardcoded athlete ID (no auth header)`);
}
```

**2. `netlify/functions/api-streams.ts`**
- Same pattern as api-activities.ts
- Falls back to athlete ID 104662 when no auth header present
- Logs warning for monitoring

### How It Works

1. **With Auth Header** (future state):
   - `optionalAuth()` validates JWT token
   - Extracts `userId` and `athleteId` from database
   - Full user isolation and security

2. **Without Auth Header** (current iOS app):
   - `optionalAuth()` returns `null`
   - Falls back to hardcoded `athleteId = 104662`
   - Logs warning for visibility
   - App works as before

## Next Steps (Proper Authentication)

To fully implement authentication in the iOS app:

### 1. Add Supabase SDK to iOS App

```swift
// Add to Package.swift or SPM
.package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0")
```

### 2. Initialize Supabase Client

```swift
import Supabase

let supabase = SupabaseClient(
    supabaseURL: URL(string: "YOUR_SUPABASE_URL")!,
    supabaseKey: "YOUR_SUPABASE_ANON_KEY"
)
```

### 3. Update VeloReadyAPIClient.swift

```swift
private func makeRequest<T: Decodable>(url: URL) async throws -> T {
    var request = URLRequest(url: url)
    request.timeoutInterval = 30
    
    // Get current session token from Supabase
    if let session = try? await supabase.auth.session {
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    }
    
    // ... rest of request logic
}
```

### 4. Handle Authentication Flow

- Implement Strava OAuth → Supabase auth flow
- Store session tokens securely
- Refresh tokens when expired
- Handle auth errors gracefully

## Deployment Status

✅ **Deployed**: Changes pushed to `main` and deployed to Netlify
- Commit: `13d0473b` - "Fix: Make authentication optional for iOS app compatibility"
- Status: Live and working
- iOS app should now successfully fetch Strava data

## Monitoring

Watch for these log messages in Netlify Functions:
```
⚠️ Using hardcoded athlete ID (no auth header) - athleteId=104662
```

Once iOS app implements proper auth, these warnings will disappear.

## Security Notes

⚠️ **Current State**: Single-user app with hardcoded athlete ID
✅ **Future State**: Multi-user app with proper JWT authentication

The fallback to hardcoded athlete ID is **TEMPORARY** and should be removed once:
1. iOS app implements Supabase authentication
2. All API requests include `Authorization: Bearer <token>` header
3. Backend can safely require authentication for all endpoints
