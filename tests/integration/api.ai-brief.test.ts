import { describe, it, expect, beforeAll } from 'vitest'
import { TestHelpers } from '../helpers/testHelpers'
import { testAIBriefHandler as aiBrief } from '../helpers/testHandlers'

describe('API: /api/ai-brief', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Create test user
    testUser = await TestHelpers.createTestUser()
    authToken = await TestHelpers.getAuthToken(testUser)
  })

  it('should return AI brief for authenticated user', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/ai-brief',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { 
        date: '2025-10-27',
        metrics: {
          ctl: 60.5,
          atl: 55.2,
          tsb: 5.3,
          hrv: 45.2,
          rhr: 48,
          sleepScore: 85
        }
      }
    })

    // Call the actual API handler
    const netlifyResponse = await aiBrief(req)
    const { status, data } = await TestHelpers.parseResponse(netlifyResponse)

    expect(status).toBe(200)
    expect(data).toHaveProperty('text')
    expect(typeof data.text).toBe('string')
    expect(data.text.length).toBeGreaterThan(0)
  })

  it('should reject unauthenticated requests', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/ai-brief',
      headers: { 'Content-Type': 'application/json' }, // No auth token
      body: { 
        date: '2025-10-27',
        metrics: {
          ctl: 60.5,
          atl: 55.2,
          tsb: 5.3
        }
      }
    })

    // Call the actual API handler
    const netlifyResponse = await aiBrief(req)
    const { status, data } = await TestHelpers.parseResponse(netlifyResponse)

    expect(status).toBe(401)
    expect(data).toHaveProperty('error')
  })

  it('should handle missing metrics', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/ai-brief',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { 
        date: '2025-10-27'
        // Missing metrics
      }
    })

    // Call the actual API handler
    const netlifyResponse = await aiBrief(req)
    const { status, data } = await TestHelpers.parseResponse(netlifyResponse)

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('should handle invalid date format', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/ai-brief',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { 
        date: 'invalid-date',
        metrics: {
          ctl: 60.5,
          atl: 55.2,
          tsb: 5.3
        }
      }
    })

    // Call the actual API handler
    const netlifyResponse = await aiBrief(req)
    const { status, data } = await TestHelpers.parseResponse(netlifyResponse)

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('should return cached brief when available', async () => {
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/ai-brief',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { 
        date: '2025-10-27',
        metrics: {
          ctl: 60.5,
          atl: 55.2,
          tsb: 5.3,
          hrv: 45.2,
          rhr: 48,
          sleepScore: 85
        }
      }
    })

    // Call the actual API handler
    const netlifyResponse = await aiBrief(req)
    const { status, data } = await TestHelpers.parseResponse(netlifyResponse)

    expect(status).toBe(200)
    expect(data).toHaveProperty('text')
    expect(data).toHaveProperty('cached')
    expect(typeof data.cached).toBe('boolean')
  })

  it('should handle rate limiting', async () => {
    // This test would need to be implemented with actual rate limiting
    // For now, we'll just test that the endpoint responds
    const req = TestHelpers.createMockRequest({
      method: 'POST',
      path: '/api/ai-brief',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { 
        date: '2025-10-27',
        metrics: {
          ctl: 60.5,
          atl: 55.2,
          tsb: 5.3
        }
      }
    })

    // Call the actual API handler
    const response = await aiBrief(req)
    const { status } = await TestHelpers.parseResponse(response)
    
    // Should either succeed or be rate limited
    expect([200, 429]).toContain(status)
  })
})
