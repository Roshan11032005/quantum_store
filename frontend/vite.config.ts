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
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@noble/post-quantum'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@tanstack/react-query/')) {
            return 'query-vendor';
          }
          if (id.includes('node_modules/recharts/')) {
            return 'chart-vendor';
          }
          if (
            id.includes('node_modules/@noble/post-quantum/') ||
            id.includes('node_modules/@noble/hashes/')
          ) {
            return 'crypto-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    headers: {
      // Dev CSP: 'unsafe-inline' is required for Vite's React HMR preamble injection.
      // The production CSP (nginx.conf) is stricter and does not include 'unsafe-inline'.
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:8000 ws://localhost:5173; worker-src 'self' blob:; img-src 'self' data:;",
    },
  },
});
