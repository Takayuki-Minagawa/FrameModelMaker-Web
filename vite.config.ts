/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/FrameModelMaker-Web/',
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        // Vite 8 / Rolldown equivalent of Rollup's manualChunks. Keep the
        // large, stable libraries cacheable independently from app changes.
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/]three[\\/]/,
              priority: 20,
            },
            {
              name: 'yaml',
              test: /node_modules[\\/]yaml[\\/]/,
              priority: 20,
            },
          ],
        },
        strictExecutionOrder: true,
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
    },
  },
});
