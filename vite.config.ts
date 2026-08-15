import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'geojson-module',
      enforce: 'pre',
      transform(source, id) {
        if (id.endsWith('.geojson')) return `export default ${source}`
      },
    },
    react(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
})
