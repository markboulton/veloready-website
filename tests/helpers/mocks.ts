import { vi } from 'vitest'

// Mock database connection
const mockDb = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  one: vi.fn().mockResolvedValue({ id: 123456789, user_id: 'test-user-id' }),
  none: vi.fn().mockResolvedValue(undefined),
  any: vi.fn().mockResolvedValue([])
}

// Mock withDb function
export const mockWithDb = vi.fn((fn) => fn(mockDb))

// Mock getAthlete function
export const mockGetAthlete = vi.fn((c, athleteId) => {
  return Promise.resolve({ id: athleteId, user_id: 'test-user-id' })
})

// Mock upsertActivitySummary function
export const mockUpsertActivitySummary = vi.fn(() => Promise.resolve())

// Mock saveTokens function
export const mockSaveTokens = vi.fn(() => Promise.resolve())

// Mock authenticate function
export const mockAuthenticate = vi.fn((event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader || !authHeader.includes('Bearer')) {
    return {
      statusCode: 401,
      error: "Missing or invalid authorization header"
    }
  }
  return {
    userId: 'test-user-id',
    athleteId: 123456789
  }
})

// Mock Netlify Blobs
export const mockGetStore = vi.fn(() => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined)
}))
