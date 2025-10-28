// Phase 2 E2E Backend Mocking with MSW
// Provides realistic API responses for E2E tests

import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock data for E2E tests
const mockActivities = [
  {
    id: 123456789,
    name: "Morning Training Ride",
    distance: 25000,
    moving_time: 3600,
    elapsed_time: 3600,
    total_elevation_gain: 300,
    type: "Ride",
    sport_type: "Ride",
    start_date: "2025-10-27T06:00:00Z",
    start_date_local: "2025-10-27T07:00:00Z",
    timezone: "America/New_York",
    average_speed: 6.94,
    max_speed: 12.5,
    average_watts: 200,
    weighted_average_watts: 210,
    kilojoules: 720,
    average_heartrate: 150,
    max_heartrate: 175,
    average_cadence: 85,
    has_heartrate: true,
    elev_high: 1000,
    elev_low: 700,
    calories: 500,
    start_latlng: [40.7128, -74.0060],
    external_id: "test-external-id",
    upload_id: 12345,
    upload_id_str: "12345"
  },
  {
    id: 987654321,
    name: "Evening Recovery Ride",
    distance: 15000,
    moving_time: 2700,
    elapsed_time: 2700,
    total_elevation_gain: 150,
    type: "Ride",
    sport_type: "Ride",
    start_date: "2025-10-26T18:00:00Z",
    start_date_local: "2025-10-26T19:00:00Z",
    timezone: "America/New_York",
    average_speed: 5.56,
    max_speed: 8.5,
    average_watts: 120,
    weighted_average_watts: 125,
    kilojoules: 324,
    average_heartrate: 130,
    max_heartrate: 145,
    average_cadence: 75,
    has_heartrate: true,
    elev_high: 800,
    elev_low: 650,
    calories: 300,
    start_latlng: [40.7589, -73.9851],
    external_id: "test-external-id-2",
    upload_id: 12346,
    upload_id_str: "12346"
  }
];

const mockStreams = {
  power: [200, 210, 195, 205, 200, 190, 220, 180, 200, 210],
  heartrate: [150, 155, 148, 152, 150, 145, 160, 140, 150, 155],
  time: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  cadence: [85, 87, 83, 86, 85, 82, 88, 80, 85, 87],
  velocity: [6.94, 7.1, 6.8, 7.0, 6.9, 6.7, 7.2, 6.5, 6.9, 7.1]
};

const mockAIBrief = {
  text: "Great recovery! Your HRV is excellent and sleep quality is good. Ready for a 50 TSS Z2 ride today. Focus on maintaining consistent power output.",
  cached: false,
  confidence: 0.85,
  metrics: {
    hrv: 45.2,
    rhr: 48,
    sleepScore: 85,
    ctl: 60.5,
    atl: 55.2,
    tsb: 5.3
  }
};

const mockRecoveryScore = {
  score: 87,
  status: "Excellent",
  components: {
    hrv: 92,
    rhr: 85,
    sleep: 88,
    strain: 90
  },
  trend: "improving",
  recommendation: "Ready for high-intensity training"
};

// MSW server setup
export const e2eMockServer = setupServer(
  // Activities API
  http.post('/api/activities', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return HttpResponse.json({
      activities: mockActivities,
      athleteId: 987654321,
      total: mockActivities.length,
      page: 1
    });
  }),

  // Streams API
  http.post('/api/streams', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { activityId, types } = body;

    if (!activityId) {
      return HttpResponse.json({ error: 'Missing activity ID' }, { status: 400 });
    }

    // Return requested stream types
    const response: any = {};
    if (types && Array.isArray(types)) {
      types.forEach((type: string) => {
        if (mockStreams[type as keyof typeof mockStreams]) {
          response[type] = mockStreams[type as keyof typeof mockStreams];
        }
      });
    } else {
      response.power = mockStreams.power;
      response.heartrate = mockStreams.heartrate;
      response.time = mockStreams.time;
    }

    return HttpResponse.json(response);
  }),

  // AI Brief API
  http.post('/api/ai-brief', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { metrics, date } = body;

    if (!metrics) {
      return HttpResponse.json({ error: 'Missing metrics' }, { status: 400 });
    }

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return HttpResponse.json(mockAIBrief);
  }),

  // Wellness API
  http.get('/api/wellness', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const daysBack = url.searchParams.get('daysBack') || '7';

    return HttpResponse.json({
      wellness: [
        {
          date: "2025-10-27",
          fitness: 60.5,
          fatigue: 55.2,
          form: 5.3,
          hrv: 45.2,
          rhr: 48,
          sleepScore: 85
        },
        {
          date: "2025-10-26",
          fitness: 59.8,
          fatigue: 58.1,
          form: 1.7,
          hrv: 42.1,
          rhr: 50,
          sleepScore: 78
        }
      ]
    });
  }),

  // OAuth Start
  http.get('/oauth/strava/start', async ({ request }) => {
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get('redirect_uri');
    
    if (!redirectUri) {
      return HttpResponse.json({ error: 'Missing redirect_uri' }, { status: 400 });
    }

    return HttpResponse.redirect(
      `https://www.strava.com/oauth/authorize?client_id=test&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read,activity:read&state=test-state`,
      302
    );
  }),

  // OAuth Token Exchange
  http.post('/oauth/strava/token-exchange', async ({ request }) => {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return HttpResponse.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    return HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      athlete_id: 987654321,
      athlete: {
        id: 987654321,
        username: 'testuser',
        firstname: 'Test',
        lastname: 'User'
      }
    });
  }),

  // Intervals.icu Activities
  http.get('/api/intervals/activities', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return HttpResponse.json({
      activities: mockActivities.map(activity => ({
        ...activity,
        tss: 50 + Math.random() * 30, // Random TSS between 50-80
        intensityFactor: 0.8 + Math.random() * 0.4 // Random IF between 0.8-1.2
      })),
      athleteId: 987654321
    });
  }),

  // Intervals.icu Streams
  http.get('/api/intervals/streams', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const activityId = url.searchParams.get('activityId');

    if (!activityId) {
      return HttpResponse.json({ error: 'Missing activity ID' }, { status: 400 });
    }

    return HttpResponse.json(mockStreams);
  })
);

// Helper functions for E2E tests
export const startE2EMocking = () => {
  e2eMockServer.listen({
    onUnhandledRequest: 'warn'
  });
  console.log('🎭 E2E Backend mocking started');
};

export const stopE2EMocking = () => {
  e2eMockServer.close();
  console.log('🎭 E2E Backend mocking stopped');
};

export const resetE2EMocking = () => {
  e2eMockServer.resetHandlers();
  console.log('🎭 E2E Backend mocking reset');
};
