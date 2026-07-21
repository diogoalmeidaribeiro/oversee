import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Node server runs on 4600. In dev, Vite serves the UI on 5180 and proxies
// the API + WebSocket channels through to the server so everything is same-origin.
const SERVER = 'http://localhost:4600'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER.replace('http', 'ws'), ws: true },
    },
  },
  build: { outDir: 'dist' },
})
