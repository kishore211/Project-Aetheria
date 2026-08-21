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
  build: {
    sourcemap: true,
    outDir: 'dist',
    rollupOptions: {
      output: {
        // three.js dwarfs everything else; splitting it out means a code change
        // to the game does not invalidate a ~700 kB vendor chunk in the cache.
        manualChunks: {
          three: ['three'],
          drei: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 3000,
  },
  test: {
    // jsdom gives the sprite/atlas code a `document` to draw into. Its canvas
    // has no 2D context, which the atlas builder tolerates by design, so tests
    // exercise the real classes without a GPU.
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
