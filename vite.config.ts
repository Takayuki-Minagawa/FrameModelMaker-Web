/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/FrameModelMaker-Web/',
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
