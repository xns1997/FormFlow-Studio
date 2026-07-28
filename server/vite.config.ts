import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import manifest from '../package.json' with { type: 'json' };

const dependencies = Object.keys(manifest.dependencies || {});
const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  ...dependencies,
];

export default defineConfig({
  build: {
    ssr: resolve(__dirname, 'src/index.ts'),
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    rolldownOptions: {
      external,
      output: {
        entryFileNames: 'index.js',
      },
    },
  },
});
