/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In sviluppo /api va al backend NestJS locale (cd backend && npm run start:dev).
// Su Vercel lo stesso inoltro lo fa vercel.json.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    proxy: {
      '/api': process.env.BACKEND_URL ?? 'http://localhost:3000',
    },
  },
})
