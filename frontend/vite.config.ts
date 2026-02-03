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
        manualChunks: {
          // Разделяем vendor библиотеки на отдельные чанки
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          utils: ['clsx', 'axios', 'react-hot-toast'],
          // Группируем иконки в один чанк, чтобы избежать сотен мелких предзагрузок
          icons: ['@heroicons/react'],
        },
      },
    },
  },
});