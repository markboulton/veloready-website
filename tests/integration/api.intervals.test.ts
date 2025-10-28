import { describe, it, expect, beforeAll } from 'vitest'
import { TestHelpers } from '../helpers/testHelpers'
import { testIntervalsActivitiesHandler as intervalsActivities } from '../helpers/testHandlers'
import { testStreamsHandler as intervalsStreams } from '../helpers/testHandlers'

describe('API: Intervals.icu Integration', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Create test user
    testUser = await TestHelpers.createTestUser()
    authToken = await TestHelpers.getAuthToken(testUser)
  })

  describe('Intervals Activities', () => {
    it('should return intervals activities for authenticated user', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'GET',
        path: '/api/intervals/activities',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        queryStringParameters: { 
          daysBack: '30',
          limit: '50'
        }
      })

      // Call the actual API handler
      const netlifyResponse = await intervalsActivities(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('activities')
      expect(Array.isArray(data.activities)).toBe(true)
    })

    it('should reject unauthenticated requests', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'GET',
        path: '/api/intervals/activities',
        headers: { 'Content-Type': 'application/json' }, // No auth token
        queryStringParameters: { 
          daysBack: '30',
          limit: '50'
        }
      })

      // Call the actual API handler
      const netlifyResponse = await intervalsActivities(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toHaveProperty('error')
    })

    it('should handle missing query parameters', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'GET',
        path: '/api/intervals/activities',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
        // Missing query parameters
      })

      // Call the actual API handler
      const netlifyResponse = await intervalsActivities(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(200) // Should use defaults
      expect(data).toHaveProperty('activities')
      expect(Array.isArray(data.activities)).toBe(true)
    })
  })

  describe('Intervals Streams', () => {
    it('should return intervals streams for authenticated user', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/api/intervals/streams',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: { 
          activityId: 123456789,
          types: ['power', 'heartrate']
        }
      })

      // Call the actual API handler
      const netlifyResponse = await intervalsStreams(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('power')
      expect(data).toHaveProperty('heartrate')
      expect(data).toHaveProperty('time')
    })

    it('should reject unauthenticated requests', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/api/intervals/streams',
        headers: { 'Content-Type': 'application/json' }, // No auth token
        body: { 
          activityId: 123456789,
          types: ['power', 'heartrate']
        }
      })

      // Call the actual API handler
      const netlifyResponse = await intervalsStreams(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toHaveProperty('error')
    })

    it('should handle missing activity ID', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/api/intervals/streams',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: { 
          types: ['power', 'heartrate']
          // Missing activityId
        }
      })

      // Call the actual API handler
      const netlifyResponse = await intervalsStreams(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
    })
  })
})
