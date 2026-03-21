/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Handle CSS imports (with CSS modules)
    '\\.css$': 'identity-obj-proxy',
    // Handle image imports
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.ts'
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__mocks__/'
  ],
  // Files to ignore as test files
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/__tests__/mockFactory.ts',
    '/src/__tests__/msw/',
    '/src/utils/testHelpers/',
    '/src/__tests__/utils/recordApiResponses.ts', // Don't run this as a test
    '/src/utils/testHelpers/recordApiResponses.ts' // Don't run this as a test
  ],
  // Explicitly tell Jest to use Node's module resolution
  resolver: undefined
};

module.exports = config;
