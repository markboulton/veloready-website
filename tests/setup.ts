// Mock database modules - must be hoisted
import { vi } from 'vitest'

// Mock database modules
vi.mock('../../netlify/lib/db-pooled', () => ({
  withDb: vi.fn((fn) => fn({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    one: vi.fn().mockResolvedValue({ id: 123456789, user_id: 'test-user-id' }),
    none: vi.fn().mockResolvedValue(undefined),
    any: vi.fn().mockResolvedValue([])
  }))
}))

vi.mock('../../netlify/lib/db', () => ({
  withDb: vi.fn((fn) => fn({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    one: vi.fn().mockResolvedValue({ id: 123456789, user_id: 'test-user-id' }),
    none: vi.fn().mockResolvedValue(undefined),
    any: vi.fn().mockResolvedValue([])
  })),
  getAthlete: vi.fn((c, athleteId) => {
    return Promise.resolve({ id: athleteId, user_id: 'test-user-id' })
  }),
  upsertActivitySummary: vi.fn(() => Promise.resolve()),
  saveTokens: vi.fn(() => Promise.resolve())
}))

// Mock authentication - use our test-specific mock
vi.mock('../../netlify/lib/auth', () => import('./helpers/authMock'))

// Mock Netlify Blobs
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined)
  }))
}))

import { beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from './helpers/mockHandlers'
import { setupMockDb, resetMockDb } from './helpers/mockDb'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, 'test.env') })

// Set up test environment variables
process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY || 'test-service-key'
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
process.env.STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || 'test-client-id'
process.env.STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || 'test-client-secret'
process.env.REDIS_URL = process.env.REDIS_URL || 'https://test-redis.com'
process.env.REDIS_TOKEN = process.env.REDIS_TOKEN || 'test-redis-token'
process.env.NETLIFY_BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || 'test-blobs-token'
process.env.NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || 'test-site-id'
process.env.APP_HMAC_SECRET = process.env.APP_HMAC_SECRET || 'test-hmac-secret'
process.env.CACHE_TTL_SECONDS = process.env.CACHE_TTL_SECONDS || '3600'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test'

// Setup MSW for API mocking
export const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  setupMockDb()
})

afterEach(() => {
  server.resetHandlers()
  resetMockDb()
  setupMockDb()
})

afterAll(() => {
  server.close()
})
