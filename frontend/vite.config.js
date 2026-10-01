import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When the EcoAI server runs Vite inside itself (npm run dev at the project root)
// API calls are same-origin, so no proxy is needed. Running `npm run dev` inside
// frontend/ on its own proxies API + uploads to the server on port 5000.
const embedded = process.env.ECOAI_EMBEDDED === '1';
const target = process.env.VITE_API_TARGET || 'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react()],
  server: embedded
    ? {}
    : {
        port: 5173,
        proxy: {
          '/api': { target, changeOrigin: true },
          '/uploads': { target, changeOrigin: true },
        },
      },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          map: ['leaflet', 'react-leaflet'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
