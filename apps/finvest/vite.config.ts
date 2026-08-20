import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@finsight': path.resolve(__dirname, '../finsight'),
      '@findash': path.resolve(__dirname, '../findash'),
    },
  },
  server: {
    port: 3001, // FinVest Shell (FinDash uses 3000)
    proxy: {
      // Proxy FinSight API calls
      '/api/finsight': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/finsight/, '/api'),
      },
      // Proxy intelligence API calls
      '/api/intelligence': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

