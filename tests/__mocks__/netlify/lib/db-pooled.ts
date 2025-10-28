// Mock for netlify/lib/db-pooled module
import { withDb as mockWithDb, getAthlete as mockGetAthlete, upsertActivitySummary as mockUpsertActivitySummary, saveTokens as mockSaveTokens, setupMockDb, resetMockDb } from '../../helpers/mockDb'

export const withDb = mockWithDb
export const getAthlete = mockGetAthlete
export const upsertActivitySummary = mockUpsertActivitySummary
export const saveTokens = mockSaveTokens

// Re-export for convenience
export { setupMockDb, resetMockDb }
