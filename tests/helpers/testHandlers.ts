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
      body: JSON.stringify({ activities: mockActivities })
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
