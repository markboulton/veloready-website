import { vi } from 'vitest'

// Mock database helper for tests
export const mockDb = {
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn()
}

// Mock withDb function for tests
export async function withDb<T>(fn: (c: any) => Promise<T>) {
  await mockDb.connect()
  try {
    return await fn(mockDb)
  } finally {
    await mockDb.release()
  }
}

// Mock getAthlete function
export async function getAthlete(c: any, athleteId: number) {
  const { rows } = await c.query(`select * from athlete where id = $1`, [athleteId]);
  return rows[0] ?? null;
}

// Mock upsertActivitySummary function
export async function upsertActivitySummary(c: any, a: any) {
  // Mock implementation - just return success
  return Promise.resolve()
}

// Mock saveTokens function
export async function saveTokens(c: any, athleteId: number, access: string, refresh: string, expiresAtSec: number, scopes: string[]) {
  // Mock implementation - just return success
  return Promise.resolve()
}

// Setup mock responses
export function setupMockDb() {
  // Mock athlete query response
  mockDb.query.mockImplementation((query: string, params: any[]) => {
    if (query.includes('SELECT id FROM athlete WHERE user_id')) {
      return Promise.resolve({ rows: [{ id: 123456789 }] })
    }
    if (query.includes('select * from athlete where id')) {
      return Promise.resolve({ 
        rows: [{ 
          id: 123456789, 
          user_id: 'test-user-id',
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token'
        }] 
      })
    }
    return Promise.resolve({ rows: [] })
  })
  
  mockDb.connect.mockResolvedValue(undefined)
  mockDb.release.mockResolvedValue(undefined)
}

// Reset mocks
export function resetMockDb() {
  mockDb.query.mockReset()
  mockDb.connect.mockReset()
  mockDb.release.mockReset()
}
