import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: '..',
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('react-router')) return 'router';
          if (id.includes('@marsidev/react-turnstile')) return 'turnstile';

          // React и все react-библиотеки — в один чанк, иначе vendor грузится без React
          if (
            id.includes('/react/') ||
            id.includes('\\react\\') ||
            id.includes('react-dom') ||
            id.includes('@tanstack/react-virtual') ||
            id.includes('@tanstack/virtual-core') ||
            id.includes('lucide-react')
          ) {
            return 'react';
          }

          return undefined;
        },
      },
    },
  },
});