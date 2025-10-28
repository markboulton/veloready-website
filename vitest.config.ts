import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': './netlify/functions',
    },
  },
  define: {
    'import.meta.vitest': 'undefined',
  },
  deps: {
    inline: ['@supabase/supabase-js']
  },
  server: {
    deps: {
      inline: ['@supabase/supabase-js']
    }
  }
})