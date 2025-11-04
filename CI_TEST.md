# Backend CI Test

This file tests the GitHub Actions CI workflow for the backend.

## What's Being Tested

### Test Suites
1. **Unit Tests** (`npm run test:unit`)
   - Auth helper tests
   - Rate limiting tests
   - Cache logic tests

2. **Integration Tests** (`npm run test:integration`)
   - API endpoint tests with MSW mocks
   - Strava OAuth flow tests
   - Database integration tests

3. **Type Check** (`npm run typecheck`)
   - TypeScript compilation check
   - Type safety validation

4. **Build Check** (`npm run build`)
   - Ensures serverless functions can build

## Expected Result

✅ All tests should pass
✅ CI should complete in <3 minutes

## GitHub Secrets Required

The following secrets need to be configured in GitHub Actions:
- `TEST_SUPABASE_URL` - Test database URL
- `TEST_SUPABASE_KEY` - Test database service role key
- `TEST_STRAVA_CLIENT_ID` - Test Strava app client ID
- `TEST_STRAVA_CLIENT_SECRET` - Test Strava app client secret

**Note:** These warnings in the workflow file are expected until secrets are configured in GitHub.
