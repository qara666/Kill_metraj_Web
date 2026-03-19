import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000, //  лимит до 2000 кБ 
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet') || id.includes('react-leaflet')) return 'map-vendor';
            if (id.includes('@heroicons')) return 'icons';
            if (id.includes('react-router-dom') || id.includes('@remix-run')) return 'router-vendor';
            if (id.includes('react') && !id.includes('react-router')) return 'react-core';
            if (id.includes('@tanstack/react-query')) return 'query-vendor';
            return 'vendor'; // all other node_modules
          }
        },
      },
    },
  },
});