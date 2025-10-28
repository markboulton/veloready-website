import { describe, it, expect, beforeAll } from 'vitest'
import { TestHelpers } from '../helpers/testHelpers'
import { testStreamsHandler as apiStreams } from '../helpers/testHandlers'

describe('API: /api/streams', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Create test user
    testUser = await TestHelpers.createTestUser()
    authToken = await TestHelpers.getAuthToken(testUser)
  })

  it('should return streams for authenticated user', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/streams',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { activityId: 123456789, types: ['power', 'heartrate'] }
    })

    // Call the actual API handler
    const netlifyResponse = await apiStreams(req)
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
      path: '/api/streams',
      headers: { 'Content-Type': 'application/json' }, // No auth token
      body: { activityId: 123456789, types: ['power', 'heartrate'] }
    })

    // Call the actual API handler
    const netlifyResponse = await apiStreams(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data).toHaveProperty('error')
  })

  it('should handle missing activity ID', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/streams',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { types: ['power', 'heartrate'] } // Missing activityId
    })

    // Call the actual API handler
    const netlifyResponse = await apiStreams(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('should handle invalid stream types', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/streams',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { activityId: 123456789, types: ['invalid_type'] }
    })

    // Call the actual API handler
    const netlifyResponse = await apiStreams(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('should return empty streams for non-existent activity', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/streams',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { activityId: 999999999, types: ['power', 'heartrate'] }
    })

    // Call the actual API handler
    const netlifyResponse = await apiStreams(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('power')
    expect(data).toHaveProperty('heartrate')
    expect(data).toHaveProperty('time')
    // Should be empty arrays for non-existent activity
    expect(Array.isArray(data.power)).toBe(true)
    expect(Array.isArray(data.heartrate)).toBe(true)
    expect(Array.isArray(data.time)).toBe(true)
  })
})
