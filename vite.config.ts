import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// En desarrollo /websocket va al simulador (npm run mock) o a la Moonraker
// que digas con MOONRAKER=mk4.local:7125 npm run dev.
const target = process.env.MOONRAKER ?? 'localhost:7125'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5180,
    proxy: {
      '/websocket': { target: `ws://${target}`, ws: true },
      '/server': { target: `http://${target}` },
      '/printer': { target: `http://${target}` },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
})
