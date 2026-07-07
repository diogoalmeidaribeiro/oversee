import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Standalone marketing site. Lives beside the app and reuses the real UI
// components (../src/components) so the hero mock is the actual app, not a
// replica. Builds to landing/dist for static hosting.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] }, port: 5273 },
  build: { outDir: 'dist', emptyOutDir: true },
})
