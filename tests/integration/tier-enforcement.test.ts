import { describe, it, expect, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handler as activitiesHandler } from '../../netlify/functions/api-activities';
import { handler as intervalsActivitiesHandler } from '../../netlify/functions/api-intervals-activities';
import { handler as wellnessHandler } from '../../netlify/functions/api-intervals-wellness';
import { HandlerEvent, HandlerContext } from '@netlify/functions';

// Mock Supabase responses for different subscription tiers
const mockSupabaseAuth = (tier: 'free' | 'trial' | 'pro', expires?: string) => {
  return http.post('*/auth/v1/user', () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'strava-104662@veloready.app',
      user_metadata: {}
    });
  });
};

const mockSupabaseSubscription = (tier: 'free' | 'trial' | 'pro', expires?: string) => {
  return http.get('*/rest/v1/user_subscriptions*', () => {
    return HttpResponse.json({
      user_id: 'test-user-id',
      subscription_tier: tier,
      expires_at: expires || null
    });
  });
};

const mockDatabase = () => {
  return http.post('*', async ({ request }) => {
    const body = await request.text();
    if (body.includes('SELECT id FROM athlete')) {
      return HttpResponse.json({
        rows: [{ id: 104662 }]
      });
    }
    return HttpResponse.json({ rows: [] });
  });
};

const mockStravaActivities = () => {
  return http.get('https://www.strava.com/api/v3/athlete/activities', () => {
    return HttpResponse.json([
      { id: 123, name: 'Morning Ride', type: 'Ride', distance: 50000 }
    ]);
  });
};

const mockIntervalsActivities = () => {
  return http.get('https://intervals.icu/api/v1/athlete/*/activities', () => {
    return HttpResponse.json([
      { id: 456, name: 'Workout', type: 'Ride' }
    ]);
  });
};

const mockIntervalsWellness = () => {
  return http.get('https://intervals.icu/api/v1/athlete/*/wellness*', () => {
    return HttpResponse.json([
      { id: '2025-11-03', hrv: 45, rhr: 58 }
    ]);
  });
};

// Create mock event helper
const createMockEvent = (
  queryParams: Record<string, string> = {},
  path: string = '/api/activities'
): HandlerEvent => ({
  headers: {
    authorization: 'Bearer mock-jwt-token'
  },
  httpMethod: 'GET',
  path,
  queryStringParameters: queryParams,
  body: null,
  isBase64Encoded: false,
  multiValueQueryStringParameters: null,
  rawUrl: `https://api.veloready.app${path}`,
  rawQuery: new URLSearchParams(queryParams).toString(),
  multiValueHeaders: {},
});

const mockContext: HandlerContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: 'test-log-group',
  logStreamName: 'test-log-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
  clientContext: undefined,
  identity: undefined
};

describe('Tier Enforcement - API Activities', () => {
  const server = setupServer(
    mockSupabaseAuth('free'),
    mockDatabase(),
    mockStravaActivities()
  );

  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should allow FREE user to request 90 days (within limit)', async () => {
    server.use(mockSupabaseSubscription('free'));
    
    const event = createMockEvent({ daysBack: '90' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('free');
    expect(body.metadata.daysBack).toBe(90);
  });

  it('should reject FREE user requesting 365 days (exceeds limit)', async () => {
    server.use(mockSupabaseSubscription('free'));
    
    const event = createMockEvent({ daysBack: '365' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('TIER_LIMIT_EXCEEDED');
    expect(body.currentTier).toBe('free');
    expect(body.requestedDays).toBe(365);
    expect(body.maxDaysAllowed).toBe(90);
    expect(body.message).toContain('free plan allows access to 90 days');
  });

  it('should allow PRO user to request 365 days (within limit)', async () => {
    server.use(mockSupabaseSubscription('pro'));
    
    const event = createMockEvent({ daysBack: '365' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('pro');
    expect(body.metadata.daysBack).toBe(365);
  });

  it('should allow TRIAL user to request 365 days (within limit)', async () => {
    server.use(mockSupabaseSubscription('trial'));
    
    const event = createMockEvent({ daysBack: '365' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('trial');
    expect(body.metadata.daysBack).toBe(365);
  });

  it('should cap FREE user request to 100 activities (maxActivities limit)', async () => {
    server.use(mockSupabaseSubscription('free'));
    
    const event = createMockEvent({ daysBack: '30', limit: '500' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('free');
    expect(body.metadata.limit).toBe(100); // Capped to free tier limit
  });

  it('should allow PRO user to request 500 activities', async () => {
    server.use(mockSupabaseSubscription('pro'));
    
    const event = createMockEvent({ daysBack: '30', limit: '500' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('pro');
    expect(body.metadata.limit).toBe(500);
  });
});

describe('Tier Enforcement - Intervals Activities', () => {
  const server = setupServer(
    mockSupabaseAuth('free'),
    mockDatabase(),
    mockIntervalsActivities()
  );

  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should reject FREE user requesting 180 days from Intervals.icu', async () => {
    server.use(mockSupabaseSubscription('free'));
    
    const event = createMockEvent({ daysBack: '180' }, '/api/intervals/activities');
    const response = await intervalsActivitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('TIER_LIMIT_EXCEEDED');
    expect(body.currentTier).toBe('free');
    expect(body.maxDaysAllowed).toBe(90);
  });

  it('should allow PRO user to request 180 days from Intervals.icu', async () => {
    server.use(mockSupabaseSubscription('pro'));
    
    const event = createMockEvent({ daysBack: '180' }, '/api/intervals/activities');
    const response = await intervalsActivitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('pro');
  });
});

describe('Tier Enforcement - Wellness Data', () => {
  const server = setupServer(
    mockSupabaseAuth('free'),
    mockDatabase(),
    mockIntervalsWellness()
  );

  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should reject FREE user requesting 120 days of wellness data', async () => {
    server.use(mockSupabaseSubscription('free'));
    
    const event = createMockEvent({ days: '120' }, '/api/intervals/wellness');
    const response = await wellnessHandler(event, mockContext);
    
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('TIER_LIMIT_EXCEEDED');
    expect(body.currentTier).toBe('free');
    expect(body.maxDaysAllowed).toBe(90);
  });

  it('should allow PRO user to request 120 days of wellness data', async () => {
    server.use(mockSupabaseSubscription('pro'));
    
    const event = createMockEvent({ days: '120' }, '/api/intervals/wellness');
    const response = await wellnessHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('pro');
  });
});

describe('Tier Enforcement - Edge Cases', () => {
  const server = setupServer(
    mockSupabaseAuth('free'),
    mockDatabase(),
    mockStravaActivities()
  );

  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should handle missing daysBack parameter (use default)', async () => {
    server.use(mockSupabaseSubscription('free'));
    
    const event = createMockEvent({});
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.daysBack).toBe(30); // Default value
  });

  it('should handle expired PRO subscription (downgrade to FREE)', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
    server.use(mockSupabaseSubscription('pro', pastDate));
    
    const event = createMockEvent({ daysBack: '365' });
    const response = await activitiesHandler(event, mockContext);
    
    // Should be rejected because expired pro becomes free
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('TIER_LIMIT_EXCEEDED');
    expect(body.currentTier).toBe('free'); // Downgraded
  });

  it('should handle active PRO subscription with future expiry', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days from now
    server.use(mockSupabaseSubscription('pro', futureDate));
    
    const event = createMockEvent({ daysBack: '365' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.metadata.tier).toBe('pro');
  });
});

describe('Tier Enforcement - Response Metadata', () => {
  const server = setupServer(
    mockSupabaseAuth('pro'),
    mockDatabase(),
    mockStravaActivities()
  );

  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should include tier information in successful response metadata', async () => {
    server.use(mockSupabaseSubscription('pro'));
    
    const event = createMockEvent({ daysBack: '180' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    
    expect(body.metadata).toBeDefined();
    expect(body.metadata.tier).toBe('pro');
    expect(body.metadata.daysBack).toBe(180);
    expect(body.metadata.limit).toBeDefined();
    expect(body.metadata.count).toBeDefined();
  });

  it('should include upgrade prompt in 403 error response', async () => {
    server.use(mockSupabaseSubscription('free'));
    
    const event = createMockEvent({ daysBack: '365' });
    const response = await activitiesHandler(event, mockContext);
    
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    
    expect(body.message).toContain('Upgrade');
    expect(body.message).toContain('90 days');
    expect(body.currentTier).toBe('free');
    expect(body.requestedDays).toBe(365);
    expect(body.maxDaysAllowed).toBe(90);
  });
});
