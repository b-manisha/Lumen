import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { pilesBridge } from './plugins/piles.ts'

// https://vite.dev/config/
export default defineConfig({
  // pilesBridge: dev-only local API that mirrors the delegation piles to ./piles for Claude Code agents
  plugins: [react(), tailwindcss(), pilesBridge()],
  server: {
    port: 5173,
    // agents write piles/results/*.json; never trigger a page reload for them
    watch: { ignored: ['**/piles/**'] },
  },
  build: { chunkSizeWarningLimit: 1200 },
})
