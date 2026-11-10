/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api se redirige al backend (variable VITE_API_PROXY o localhost:4000).
const target = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target, changeOrigin: false } } },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], query: ['@tanstack/react-query'] } },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
});
