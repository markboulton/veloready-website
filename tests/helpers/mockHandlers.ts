import { http, HttpResponse } from 'msw'

export const handlers = [
  // Mock Supabase Auth responses
  http.get('https://test.supabase.co/auth/v1/user', () => {
    return HttpResponse.json({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-10-27T00:00:00Z',
        aud: 'authenticated',
        role: 'authenticated',
        email_confirmed_at: '2025-01-01T00:00:00Z',
        phone_confirmed_at: null,
        last_sign_in_at: '2025-10-27T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        factors: []
      }
    })
  }),

  // Mock Supabase database queries
  http.post('https://test.supabase.co/rest/v1/rpc/query', () => {
    return HttpResponse.json([
      { id: 123456789 }
    ])
  }),

  // Mock Strava API responses
  http.get('https://www.strava.com/api/v3/athlete', () => {
    return HttpResponse.json({
      id: 123456789,
      username: 'testuser',
      firstname: 'Test',
      lastname: 'User',
      city: 'Test City',
      state: 'Test State',
      country: 'Test Country',
      sex: 'M',
      premium: false,
      summit: false,
      created_at: '2020-01-01T00:00:00Z',
      updated_at: '2025-10-27T00:00:00Z',
      badge_type_id: 0,
      weight: 70.0,
      profile_medium: 'https://example.com/medium.jpg',
      profile: 'https://example.com/large.jpg',
      friend: null,
      follower: null,
      blocked: false,
      can_follow: true,
      follower_count: 0,
      friend_count: 0,
      mutual_friend_count: 0,
      athlete_type: 0,
      date_preference: '%m/%d/%Y',
      measurement_preference: 'meters',
      email: 'test@example.com',
      ftp: 250,
      max_heartrate: 185,
      weight_class: 'kg',
      clubs: [],
      bikes: [],
      shoes: []
    })
  }),

  http.get('https://www.strava.com/api/v3/activities', () => {
    return HttpResponse.json([
      {
        id: 987654321,
        external_id: 'test-activity-1',
        upload_id: 123456789,
        athlete: { id: 123456789, resource_state: 1 },
        name: 'Test Morning Ride',
        distance: 25000.0,
        moving_time: 3600,
        elapsed_time: 3600,
        total_elevation_gain: 300.0,
        type: 'Ride',
        sport_type: 'MountainBikeRide',
        start_date: '2025-10-27T06:00:00Z',
        start_date_local: '2025-10-27T06:00:00Z',
        timezone: 'America/New_York',
        utc_offset: -14400.0,
        start_latlng: [40.7128, -74.0060],
        end_latlng: [40.7128, -74.0060],
        achievement_count: 0,
        kudos_count: 0,
        comment_count: 0,
        athlete_count: 1,
        photo_count: 0,
        map: {
          id: 'a123456789',
          polyline: 'test-polyline',
          resource_state: 2,
          summary_polyline: 'test-summary-polyline'
        },
        trainer: false,
        commute: false,
        manual: false,
        private: false,
        flagged: false,
        gear_id: null,
        from_accepted_tag: false,
        average_speed: 6.94,
        max_speed: 12.5,
        average_cadence: 85.0,
        average_watts: 200.0,
        weighted_average_watts: 210.0,
        kilojoules: 720.0,
        device_watts: true,
        has_heartrate: true,
        average_heartrate: 150.0,
        max_heartrate: 175.0,
        heartrate_opt_out: false,
        display_hide_heartrate_option: false,
        elev_high: 100.0,
        elev_low: 50.0,
        pr_count: 0,
        total_photo_count: 0,
        has_kudoed: false,
        suffer_score: 50
      }
    ])
  }),

  // Mock OpenAI API
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [
        {
          message: {
            content: 'Great recovery! Ready for 50 TSS Z2 ride today.',
            role: 'assistant'
          }
        }
      ]
    })
  }),

  // Mock Redis API for rate limiting
  http.get('https://test-redis.com/get/*', () => {
    return HttpResponse.json(null) // No cached data
  }),

  http.post('https://test-redis.com/incrby/*', () => {
    return HttpResponse.json(1) // Rate limit counter
  }),

  http.post('https://test-redis.com/expire/*', () => {
    return HttpResponse.json(1) // Success
  }),

  http.post('https://test-redis.com/setex/*', () => {
    return HttpResponse.json('OK') // Success
  }),

  // Mock Netlify Blobs
  http.get('https://api.netlify.com/v1/sites/test-site-id/blobs/ai-brief/*', () => {
    return HttpResponse.json(null) // No cached data
  }),

  http.put('https://api.netlify.com/v1/sites/test-site-id/blobs/ai-brief/*', () => {
    return HttpResponse.json({ success: true })
  }),

  // Mock Strava token exchange
  http.post('https://www.strava.com/oauth/token', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      athlete: {
        id: 123456789,
        username: 'testuser',
        firstname: 'Test',
        lastname: 'User'
      }
    })
  })
]
