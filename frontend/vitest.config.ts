/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      'src/__tests__/mockFactory.ts',
      'src/__tests__/msw/**',
      'src/utils/testHelpers/**',
      'src/__tests__/utils/recordApiResponses.ts',
      'src/utils/testHelpers/recordApiResponses.ts',
    ],
    coverage: {
      exclude: ['node_modules', '__mocks__'],
    },
    globals: true,
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
}));
