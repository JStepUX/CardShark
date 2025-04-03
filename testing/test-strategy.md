# CardShark Testing Strategy

## Testing Layers

1. **Unit Tests**
   - Test individual functions and classes in isolation
   - Focus on utils, helpers, and service functions first
   - Mock all external dependencies

2. **Component Tests**
   - Test React components in isolation
   - Verify rendering, state changes, and user interactions
   - Mock context providers and service dependencies

3. **Integration Tests**
   - Test interactions between multiple components or services
   - Focus on key user flows (API configuration, template management, chat interactions)
   - Use mock server for API responses

4. **Optional Live API Tests**
   - Conditionally run tests against real APIs when available
   - Skip these tests in CI/CD environments
   - Use to validate mock responses match real API behavior
   - Keep separate from regular test suites with naming convention `*.integration.test.ts`

5. **E2E Tests** (future consideration)
   - Test complete user flows in a real-like environment
   - Consider using Playwright or Cypress

## Test Coverage Targets

- **High Priority (90%+ coverage)**
  - Core utilities (API transformers, stream handlers)
  - Template processing
  - Chat message formatting

- **Medium Priority (70%+ coverage)**
  - React components
  - Context providers
  - Service classes

- **Lower Priority (case-by-case basis)**
  - UI presentation components
  - Third-party library wrappers

## Test Organization

- Tests should mirror the source directory structure
- Use descriptive test file names: `[filename].test.ts`
- Group tests by functionality using describe blocks
- Name tests descriptively using it/test blocks
- Place integration tests in `__tests__/integration` directory with `.integration.test.ts` extension

## Mocking Strategy

- Use Jest mock functions for simple dependencies
- Use MSW (Mock Service Worker) for API mocking
- Create dedicated mock factories for complex objects
- Record and replay real API responses for more accurate mocks

## Running Tests

- Standard tests: `npm test`
- Watch mode for development: `npm run test:watch`
- With coverage report: `npm run test:coverage`
- Including integration tests: `npm test -- --testMatch="**/*.integration.test.ts"`
