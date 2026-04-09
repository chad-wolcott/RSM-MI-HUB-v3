import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'msal':  ['@azure/msal-browser', '@azure/msal-react'],
          'react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
