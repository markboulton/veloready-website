// Mock for netlify/lib/db module
import { withDb as mockWithDb, setupMockDb, resetMockDb } from '../../helpers/mockDb'

export const withDb = mockWithDb

// Re-export for convenience
export { setupMockDb, resetMockDb }
