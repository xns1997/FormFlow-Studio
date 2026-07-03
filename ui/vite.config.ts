import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        chunkFileNames(chunk) {
          const nodePackage = chunk.facadeModuleId?.match(/[/\\]nodes[/\\]([^/\\]+)[/\\]index\.ts$/)?.[1];
          return nodePackage ? `assets/nodes/${nodePackage}-[hash].js` : 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
