module.exports = {
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      tsconfig: 'frontend/tsconfig.json',
      jsx: 'react-jsx'
    }
  },
  // Mock console.error during tests to prevent test failures
  setupFiles: ['<rootDir>/frontend/jest.setup.console.js'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    // Handle CSS/SCSS/image imports in tests
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/frontend/__mocks__/fileMock.ts',
    // Add path aliases for components and types
    '^@components/(.*)$': '<rootDir>/frontend/src/components/$1',
    '^@types/(.*)$': '<rootDir>/frontend/src/types/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/frontend/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  collectCoverageFrom: [
    'frontend/src/**/*.{js,jsx,ts,tsx}',
    '!frontend/src/**/*.d.ts',
    '!frontend/src/index.tsx',
    '!frontend/src/main.tsx',
  ],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
};
