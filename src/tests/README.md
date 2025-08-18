# Testing Infrastructure

This directory contains the testing setup for GG Requestz, including unit tests, integration tests, and end-to-end tests.

## Test Structure

```
src/tests/
├── README.md           # This file
├── setup.js           # Test environment setup
├── mocks/             # Mock modules for testing
│   └── env.js         # Environment variable mocks
├── unit/              # Unit tests for individual functions/components
│   ├── auth.test.js   # Authentication utilities tests
│   ├── utils.test.js  # Utility functions tests
│   ├── performance.test.js # Performance utilities tests
│   └── GameCard.test.js    # Component tests
└── integration/       # Integration tests (future)

tests/e2e/             # End-to-end tests (Playwright)
├── homepage.spec.js   # Homepage functionality tests
└── auth.spec.js       # Authentication flow tests
```

## Running Tests

### Unit Tests (Vitest)

```bash
# Run all unit tests
npm run test:unit

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### End-to-End Tests (Playwright)

```bash
# Run all e2e tests
npm run test:e2e

# Run tests with UI
npm run test:e2e:ui

# Debug tests
npm run test:e2e:debug

# Install browsers (first time only)
npx playwright install
```

### All Tests

```bash
# Run both unit and e2e tests
npm run test:all
```

## Test Configuration

### Vitest Configuration

- **Environment**: jsdom for browser-like testing
- **Setup**: Automatic mocking of browser APIs
- **Coverage**: Text, JSON, and HTML reports
- **Mocks**: Server-only modules mocked to prevent import errors

### Playwright Configuration

- **Browsers**: Chrome, Firefox, Safari (desktop and mobile)
- **Base URL**: http://127.0.0.1:5174 (dev server)
- **Screenshots**: On failure only
- **Traces**: On retry for debugging

## Writing Tests

### Unit Tests

Use Vitest with Testing Library for component tests:

```javascript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import MyComponent from "$lib/MyComponent.svelte";

describe("MyComponent", () => {
  it("should render correctly", () => {
    render(MyComponent, { props: { title: "Test" } });
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
```

### E2E Tests

Use Playwright for full user journey testing:

```javascript
import { test, expect } from "@playwright/test";

test("user can complete workflow", async ({ page }) => {
  await page.goto("/");
  await page.click('button[name="action"]');
  await expect(page.locator(".result")).toBeVisible();
});
```

## Mocking Strategy

### Browser APIs

- IntersectionObserver, PerformanceObserver
- fetch, localStorage, sessionStorage
- Image constructor, matchMedia

### Server Modules

- Environment variables ($env/dynamic/private)
- Database connections
- External API clients

## Performance Testing

Unit tests include performance utility testing:

- Resource prefetching
- Lazy loading
- Image optimization
- Bundle optimization

E2E tests include performance assertions:

- Page load times
- Lazy loading behavior
- Navigation performance

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Descriptive Names**: Test names should clearly describe what they test
3. **Mock External Dependencies**: Don't rely on external services in tests
4. **Test User Behavior**: E2E tests should simulate real user interactions
5. **Performance Assertions**: Include performance checks where relevant

## CI/CD Integration

Tests are configured for CI environments:

- Retry failed tests automatically
- Generate HTML reports
- Run in parallel when possible
- Fail build on test failures

## Debugging

### Unit Tests

- Use `npm run test:ui` for interactive debugging
- Add `console.log` statements for debugging
- Use VS Code debugger with Vitest extension

### E2E Tests

- Use `npm run test:e2e:debug` for step-by-step debugging
- Check screenshots and traces in test results
- Use `page.pause()` to pause execution

## Coverage Goals

Target coverage levels:

- **Unit Tests**: 80%+ for utilities and components
- **Integration Tests**: Key user workflows
- **E2E Tests**: Critical user journeys

## Future Enhancements

- Visual regression testing
- API integration tests
- Database integration tests
- Load testing
- Accessibility testing
