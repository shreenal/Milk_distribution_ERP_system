import { defineConfig } from 'vitest/config';
import { resolve } from 'path';


export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/helper/test-environment.ts'],
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts','test/**/*.e2e-spec.ts'],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});