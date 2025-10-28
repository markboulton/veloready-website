import { describe, it, expect, beforeAll } from 'vitest'
import { TestHelpers } from '../helpers/testHelpers'
import { testWellnessHandler as intervalsWellness } from '../helpers/testHandlers'

describe('API: Intervals Wellness', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Create test user
    testUser = await TestHelpers.createTestUser()
    authToken = await TestHelpers.getAuthToken(testUser)
  })

  it('should return wellness data for authenticated user', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/intervals/wellness',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      queryStringParameters: { 
        daysBack: '30'
      }
    })

    // Call the actual API handler
    const netlifyResponse = await intervalsWellness(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('wellness')
    expect(Array.isArray(data.wellness)).toBe(true)
  })

  it('should reject unauthenticated requests', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/intervals/wellness',
      headers: { 'Content-Type': 'application/json' }, // No auth token
      queryStringParameters: { 
        daysBack: '30'
      }
    })

    // Call the actual API handler
    const netlifyResponse = await intervalsWellness(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data).toHaveProperty('error')
  })

  it('should handle missing query parameters', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/intervals/wellness',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
      // Missing query parameters
    })

    // Call the actual API handler
    const netlifyResponse = await intervalsWellness(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(200) // Should use defaults
    expect(data).toHaveProperty('wellness')
    expect(Array.isArray(data.wellness)).toBe(true)
  })

  it('should validate daysBack parameter', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/intervals/wellness',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      queryStringParameters: { 
        daysBack: 'invalid'
      }
    })

    // Call the actual API handler
    const netlifyResponse = await intervalsWellness(req)
    const response = TestHelpers.createMockResponse(netlifyResponse)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data).toHaveProperty('error')
  })
})
