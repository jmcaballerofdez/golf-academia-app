import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/golf-academia-app/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 3000,
  },
  optimizeDeps: {
    exclude: ['firebase/app', 'firebase/firestore', 'firebase/auth']
  }
})
