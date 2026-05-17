import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        playground: resolve(__dirname, 'playground.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: process.env.ZEROCODE_API_URL ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
