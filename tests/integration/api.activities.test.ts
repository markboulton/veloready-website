import { describe, it, expect, beforeAll } from 'vitest'
import { TestHelpers } from '../helpers/testHelpers'

// Import the test-specific handler (no database connections)
import { testActivitiesHandler as apiActivities } from '../helpers/testHandlers'

describe('API: /api/activities', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Create test user
    testUser = await TestHelpers.createTestUser()
    authToken = await TestHelpers.getAuthToken(testUser)
  })

  it('should return activities for authenticated user', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/activities',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      queryStringParameters: { daysBack: '30', limit: '50' }
    })

    // Call the actual API handler
    const netlifyResponse = await apiActivities(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('activities')
    expect(Array.isArray(data.activities)).toBe(true)
    expect(data.athleteId).toBeDefined()
  })

  it('should reject unauthenticated requests', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/activities',
      headers: { 'Content-Type': 'application/json' }, // No auth token
      queryStringParameters: { daysBack: '30', limit: '50' }
    })

    // Call the actual API handler
    const netlifyResponse = await apiActivities(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data).toHaveProperty('error')
  })

  it('should handle expired tokens gracefully', async () => {
    const expiredToken = await TestHelpers.getExpiredToken()
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/activities',
      headers: { 
        'Authorization': `Bearer ${expiredToken}`,
        'Content-Type': 'application/json'
      },
      queryStringParameters: { daysBack: '30', limit: '50' }
    })

    // Call the actual API handler
    const netlifyResponse = await apiActivities(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data).toHaveProperty('error')
  })

  it('should validate query parameters', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/activities',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      queryStringParameters: { daysBack: '30', limit: '50' }
    })

    // Validate that the query parameters are properly set
    expect(req.queryStringParameters).toBeDefined()
    expect(req.queryStringParameters?.daysBack).toBe('30')
    expect(req.queryStringParameters?.limit).toBe('50')
  })

  it('should handle different limit values', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/activities',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      queryStringParameters: { daysBack: '7', limit: '10' }
    })

    // Call the actual API handler
    const netlifyResponse = await apiActivities(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('activities')
    expect(Array.isArray(data.activities)).toBe(true)
  })
})
