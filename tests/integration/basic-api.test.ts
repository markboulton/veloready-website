import { describe, it, expect } from 'vitest'

describe('Basic API Tests', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle environment variables', () => {
    expect(process.env.TEST_SUPABASE_URL).toBe('https://test.supabase.co')
    expect(process.env.OPENAI_API_KEY).toBe('test-openai-key')
  })

  it('should have proper test setup', () => {
    expect(process.env.NODE_ENV).toBe('test')
  })

  it('should be able to import test helpers', async () => {
    const { TestHelpers } = await import('../helpers/testHelpers')
    expect(TestHelpers).toBeDefined()
    expect(typeof TestHelpers.createTestUser).toBe('function')
  })

  it('should be able to create mock requests', async () => {
    const { TestHelpers } = await import('../helpers/testHelpers')
    const req = TestHelpers.createMockRequest({
      method: 'GET',
      path: '/api/test',
      headers: { 'Authorization': 'Bearer test-token' }
    })
    
    expect(req.httpMethod).toBe('GET')
    expect(req.path).toBe('/api/test')
    expect(req.headers.Authorization).toBe('Bearer test-token')
  })
})
