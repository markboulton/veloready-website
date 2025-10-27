# VeloReady Backend Testing Strategy

## The Problem
Backend changes broke production:
1. Added caching to `listActivitiesSince()`
2. Misused Netlify Blobs API (`get()` returns Blob, not string)
3. Backend returned `serverError` → broke fitness trajectory charts
4. No tests caught this before deployment

## Recommended Testing Strategy

### 1. **Unit Tests for Backend Functions** (High Priority)
Test individual functions in isolation.

**Tools:** Jest + @netlify/functions testing utilities

**Example Test:**
```typescript
// netlify/functions/__tests__/strava.test.ts
import { listActivitiesSince } from '../lib/strava';

describe('listActivitiesSince', () => {
  it('should cache activities list', async () => {
    const activities = await listActivitiesSince(104662, 1234567890, 1);
    expect(activities).toBeInstanceOf(Array);
    
    // Second call should hit cache
    const cachedActivities = await listActivitiesSince(104662, 1234567890, 1);
    expect(cachedActivities).toEqual(activities);
  });
  
  it('should handle blob store errors gracefully', async () => {
    // Mock blob store to throw error
    jest.spyOn(blobStore, 'get').mockRejectedValue(new Error('Blob error'));
    
    // Should still fetch from Strava
    const activities = await listActivitiesSince(104662, 1234567890, 1);
    expect(activities).toBeInstanceOf(Array);
  });
});
```

### 2. **Integration Tests for API Endpoints** (High Priority)
Test full request/response cycle.

**Tools:** Supertest + Netlify Dev

**Example Test:**
```typescript
// netlify/functions/__tests__/api-activities.test.ts
import request from 'supertest';

describe('GET /api-activities', () => {
  it('should return activities for authenticated user', async () => {
    const response = await request(app)
      .get('/.netlify/functions/api-activities?daysBack=7')
      .set('Authorization', `Bearer ${testJWT}`)
      .expect(200);
    
    expect(response.body).toHaveProperty('activities');
    expect(response.body.activities).toBeInstanceOf(Array);
  });
  
  it('should return 401 for unauthenticated requests', async () => {
    await request(app)
      .get('/.netlify/functions/api-activities?daysBack=7')
      .expect(401);
  });
});
```

### 3. **E2E Tests for Critical Flows** (Medium Priority)
Test full user journeys.

**Tools:** Playwright

**Example Test:**
```typescript
// e2e/fitness-trajectory.spec.ts
test('fitness trajectory chart shows CTL/ATL data', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="activity-card"]');
  
  // Wait for chart to load
  await page.waitForSelector('[data-testid="training-load-chart"]');
  
  // Verify CTL/ATL values are not 0
  const ctlText = await page.textContent('[data-testid="ctl-value"]');
  expect(parseFloat(ctlText)).toBeGreaterThan(0);
  
  const atlText = await page.textContent('[data-testid="atl-value"]');
  expect(parseFloat(atlText)).toBeGreaterThan(0);
});
```

### 4. **Pre-Deployment Smoke Tests** (High Priority)
Quick sanity checks before going live.

**Tools:** GitHub Actions + curl

**Example Workflow:**
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
      
  smoke-test:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Test API endpoints
        run: |
          # Test activities endpoint
          curl -f https://veloready.app/.netlify/functions/api-activities?daysBack=7 \
            -H "Authorization: Bearer ${{ secrets.TEST_JWT }}" || exit 1
          
          # Test ops stats
          curl -f https://veloready.app/.netlify/functions/ops-api-stats || exit 1
```

### 5. **Monitoring & Alerting** (Medium Priority)
Catch issues in production.

**Tools:** Sentry + Netlify Analytics

**Setup:**
```typescript
// netlify/lib/monitoring.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.CONTEXT || 'development',
});

export function captureError(error: Error, context?: any) {
  Sentry.captureException(error, { extra: context });
}
```

## Implementation Plan

### Phase 1: Critical Tests (Week 1)
- [ ] Unit tests for `strava.ts` (caching, error handling)
- [ ] Integration tests for `api-activities.ts`
- [ ] Integration tests for `api-streams.ts`
- [ ] GitHub Actions workflow for pre-deployment checks

### Phase 2: Coverage Expansion (Week 2)
- [ ] Unit tests for all backend functions
- [ ] Integration tests for auth endpoints
- [ ] E2E test for activity detail page
- [ ] E2E test for fitness trajectory chart

### Phase 3: Monitoring (Week 3)
- [ ] Set up Sentry for error tracking
- [ ] Add custom metrics to Netlify Analytics
- [ ] Create alerts for high error rates
- [ ] Dashboard for backend health

## Quick Wins (Do Today)

### 1. Add TypeScript Strict Mode
Catch type errors at compile time:
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### 2. Add ESLint Rules
Catch common mistakes:
```json
// .eslintrc.json
{
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "@typescript-eslint/no-floating-promises": "error"
  }
}
```

### 3. Add Pre-Commit Hook
Run tests before committing:
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test && npm run lint"
    }
  }
}
```

## Cost-Benefit Analysis

| Test Type | Setup Time | Maintenance | Value | Priority |
|-----------|------------|-------------|-------|----------|
| Unit Tests | 2 days | Low | High | **HIGH** |
| Integration Tests | 3 days | Medium | High | **HIGH** |
| E2E Tests | 5 days | High | Medium | MEDIUM |
| Smoke Tests | 1 day | Low | High | **HIGH** |
| Monitoring | 2 days | Low | High | MEDIUM |

## Preventing Today's Issue

With proper testing, today's issue would have been caught by:

1. **Unit Test**: `listActivitiesSince()` test would fail when trying to `JSON.parse()` a Blob
2. **Integration Test**: API endpoint test would return 500 error
3. **Smoke Test**: Pre-deployment check would fail before going live
4. **TypeScript**: Strict mode would warn about type mismatch

**Estimated time saved:** 2 hours of debugging + 0 production downtime = **HIGH ROI**
