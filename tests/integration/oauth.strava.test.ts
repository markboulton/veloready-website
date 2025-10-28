import { describe, it, expect, beforeAll } from 'vitest'
import { TestHelpers } from '../helpers/testHelpers'
import { testStravaOAuthStartHandler as oauthStart } from '../helpers/testHandlers'
import { testStravaOAuthCallbackHandler as oauthTokenExchange } from '../helpers/testHandlers'

describe('OAuth: Strava Authentication', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Create test user
    testUser = await TestHelpers.createTestUser()
    authToken = await TestHelpers.getAuthToken(testUser)
  })

  describe('OAuth Start', () => {
    it('should initiate OAuth flow', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'GET',
        path: '/oauth/strava/start',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        queryStringParameters: { 
          redirect_uri: 'https://veloready.app/oauth/callback'
        }
      })

      // Call the actual API handler
      const netlifyResponse = await oauthStart(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(302) // OAuth redirect
      expect(netlifyResponse.headers?.Location).toContain('strava.com/oauth/authorize')
    })

    it('should reject requests without redirect_uri', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'GET',
        path: '/oauth/strava/start',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
        // Missing redirect_uri
      })

      // Call the actual API handler
      const netlifyResponse = await oauthStart(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
    })

    it('should reject unauthenticated requests', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'GET',
        path: '/oauth/strava/start',
        headers: { 'Content-Type': 'application/json' }, // No auth token
        queryStringParameters: { 
          redirect_uri: 'https://veloready.app/oauth/callback'
        }
      })

      // Call the actual API handler
      const netlifyResponse = await oauthStart(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toHaveProperty('error')
    })
  })

  describe('OAuth Token Exchange', () => {
    it('should exchange code for tokens', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/oauth/strava/token-exchange',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: { 
          code: 'test-auth-code',
          state: 'test-state'
        }
      })

      // Call the actual API handler
      const netlifyResponse = await oauthTokenExchange(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('access_token')
      expect(data).toHaveProperty('refresh_token')
      expect(data).toHaveProperty('athlete_id')
      expect(typeof data.access_token).toBe('string')
      expect(typeof data.refresh_token).toBe('string')
      expect(typeof data.athlete_id).toBe('number')
    })

    it('should reject requests without code', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/oauth/strava/token-exchange',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: { 
          state: 'test-state'
          // Missing code
        }
      })

      // Call the actual API handler
      const netlifyResponse = await oauthTokenExchange(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
    })

    it('should reject unauthenticated requests', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/oauth/strava/token-exchange',
        headers: { 'Content-Type': 'application/json' }, // No auth token
        body: { 
          code: 'test-auth-code',
          state: 'test-state'
        }
      })

      // Call the actual API handler
      const netlifyResponse = await oauthTokenExchange(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toHaveProperty('error')
    })

    it('should handle invalid authorization code', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/oauth/strava/token-exchange',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: { 
          code: 'invalid-code',
          state: 'test-state'
        }
      })

      // Call the actual API handler
      const netlifyResponse = await oauthTokenExchange(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
    })

    it('should validate state parameter', async () => {
      const req = TestHelpers.createMockRequest({
        method: 'POST',
        path: '/oauth/strava/token-exchange',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: { 
          code: 'test-auth-code',
          state: 'invalid-state' // Wrong state
        }
      })

      // Call the actual API handler
      const netlifyResponse = await oauthTokenExchange(req)
      const response = TestHelpers.createMockResponse(netlifyResponse)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
    })
  })
})
