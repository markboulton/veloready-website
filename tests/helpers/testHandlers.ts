import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { authenticate } from './authMock';

/**
 * Test-specific handlers that use mocked dependencies
 * This avoids importing the real modules that try to connect to databases
 */

export async function testActivitiesHandler(event: HandlerEvent, context: HandlerContext) {
  try {
    // Mock authentication
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: auth.error })
      };
    }

    // Mock activities data
    const mockActivities = [
      {
        id: 123456789,
        name: "Test Morning Ride",
        distance: 25000,
        moving_time: 3600,
        type: "Ride",
        start_date: "2024-01-01T06:00:00Z",
        average_watts: 200,
        average_heartrate: 150,
        total_elevation_gain: 300
      }
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        activities: mockActivities,
        athleteId: auth.athleteId
      })
    };
  } catch (error) {
    console.error('Activities handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

export async function testWellnessHandler(event: HandlerEvent, context: HandlerContext) {
  try {
    // Mock authentication
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: auth.error })
      };
    }

    // Validate daysBack parameter
    const daysBack = event.queryStringParameters?.daysBack;
    if (daysBack) {
      const days = parseInt(daysBack);
      if (isNaN(days) || days < 1 || days > 365) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'daysBack must be a number between 1 and 365' })
        };
      }
    }

    // Mock wellness data
    const mockWellness = [
      {
        date: "2024-01-01",
        fitness: 50.0,
        fatigue: 20.0,
        form: 30.0
      }
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wellness: mockWellness })
    };
  } catch (error) {
    console.error('Wellness handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

export async function testIntervalsActivitiesHandler(event: HandlerEvent, context: HandlerContext) {
  try {
    // Mock authentication
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: auth.error })
      };
    }

    // Mock intervals activities data
    const mockActivities = [
      {
        id: "123456789",
        name: "Test Intervals Activity",
        duration: 3600,
        distance: 25000,
        averagePower: 200,
        normalizedPower: 210,
        tss: 50.0,
        startDateLocal: "2024-01-01T06:00:00Z"
      }
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: mockActivities })
    };
  } catch (error) {
    console.error('Intervals activities handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

export async function testStreamsHandler(event: HandlerEvent, context: HandlerContext) {
  try {
    // Mock authentication
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: auth.error })
      };
    }

    // Parse request body for activity ID and stream types
    let requestBody;
    try {
      requestBody = event.body ? JSON.parse(event.body) : {};
    } catch (error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    // Validate activity ID
    const activityId = requestBody.activityId;
    if (!activityId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing activity ID' })
      };
    }

    // Validate stream types if provided
    const streamTypes = requestBody.types;
    if (streamTypes && Array.isArray(streamTypes)) {
      const validTypes = ['power', 'heartrate', 'time', 'cadence', 'velocity'];
      const invalidTypes = streamTypes.filter(type => !validTypes.includes(type));
      if (invalidTypes.length > 0) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Invalid stream types: ${invalidTypes.join(', ')}` })
        };
      }
    }

    // Mock streams data
    const mockStreams = {
      power: [200, 210, 195, 205, 200],
      heartrate: [150, 155, 148, 152, 150],
      time: [0, 1, 2, 3, 4]
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockStreams)
    };
  } catch (error) {
    console.error('Streams handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

export async function testAIBriefHandler(event: HandlerEvent, context: HandlerContext) {
  try {
    // Mock authentication
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: auth.error })
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = event.body ? JSON.parse(event.body) : {};
    } catch (error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    // Validate required metrics
    if (!requestBody.metrics) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing metrics' })
      };
    }

    // Validate date format if provided
    if (requestBody.date) {
      const date = new Date(requestBody.date);
      if (isNaN(date.getTime())) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid date format' })
        };
      }
    }

    // Mock AI brief data
    const mockBrief = {
      text: "Great recovery! Ready for 50 TSS Z2 ride today.",
      cached: false
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockBrief)
    };
  } catch (error) {
    console.error('AI brief handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

export async function testStravaOAuthStartHandler(event: HandlerEvent, context: HandlerContext) {
  try {
    // Check authentication for OAuth start
    const auth = await authenticate(event);
    if ('error' in auth) {
      return {
        statusCode: auth.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: auth.error })
      };
    }

    // Validate redirect_uri parameter
    const redirectUri = event.queryStringParameters?.redirect_uri;
    if (!redirectUri) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing redirect_uri parameter' })
      };
    }

    // Mock OAuth start - redirect to Strava
    return {
      statusCode: 302,
      headers: { 
        'Location': `https://www.strava.com/oauth/authorize?client_id=test&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read,activity:read&state=test-state`
      },
      body: ''
    };
  } catch (error) {
    console.error('Strava OAuth start handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

export async function testStravaOAuthCallbackHandler(event: HandlerEvent, context: HandlerContext) {
  try {
    // OAuth callback should not require authentication
    // But we can check if there's an auth header for testing purposes
    const authHeader = event.headers.authorization || event.headers.Authorization;
    
    // Parse request body to get code
    let requestBody;
    try {
      requestBody = event.body ? JSON.parse(event.body) : {};
    } catch (error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    // Validate code parameter
    const code = requestBody.code;
    if (!code) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing authorization code' })
      };
    }

    // Validate authorization code format
    if (code === 'invalid-code') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid authorization code' })
      };
    }

    // Validate state parameter
    const state = requestBody.state;
    if (state && state !== 'test-state') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid state parameter' })
      };
    }

    // If there's no auth header, return 401 for unauthenticated requests
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Mock successful token exchange
    const mockTokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 21600, // 6 hours
      athlete_id: 123456789,
      athlete: {
        id: 123456789,
        username: 'testuser',
        firstname: 'Test',
        lastname: 'User'
      }
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockTokens)
    };
  } catch (error) {
    console.error('Strava OAuth callback handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
