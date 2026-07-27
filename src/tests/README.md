# Unit tests

The jsdom half of the Vitest setup. See [`docs/setup/TESTING.md`](../../docs/setup/TESTING.md)
for the whole picture — the four layers, and how to bring up an instance to
test against.

## Layout

```
src/tests/                          # the "unit" Vitest project (jsdom)
├── README.md
├── setup.js                        # browser API mocks
├── mocks/
│   └── env.js                      # $env/dynamic/private stub
└── unit/
    ├── auth-utils.test.js          # isAuthenticated, display name, initials
    ├── basic-auth-token.test.js    # session token signing
    ├── performance.test.js         # prefetch, metrics, image/bundle helpers
    └── utils-direct.test.js        # truncateText, formatDate, safeAsync, withTimeout

tests/                              # everything outside src/
├── integration/                    # the "integration" Vitest project (node)
│   └── romm-token-lifecycle.test.js
├── e2e/                            # Playwright
│   ├── global-setup.js             # refuses to run without the test stack
│   ├── helpers.js                  # signIn(), seeded credentials
│   ├── auth.spec.js
│   └── homepage.spec.js
└── fixtures/
    └── games.json                  # seed data for the Docker stack
```

## Which project to add a test to

**`src/tests/unit/`** — pure functions and Svelte components. Runs under jsdom,
so browser globals exist.

**`tests/integration/`** — anything under `src/lib/*.server.js` or otherwise
server-only. Runs under node, because that code branches on `browser` and takes
the wrong path when a DOM is present. Mock `fetch`; these must not reach the
network.

**`tests/e2e/`** — real browser against a real installation. Needs
`make test-seeded` first. Anything asserting on the application shell has to
call `signIn()` from `helpers.js`: an unauthenticated visitor is redirected to
`/login`, which drops the shell on hydration.

```bash
npm run test:unit          # jsdom project
npm run test:integration   # node project
npm run test:e2e           # Playwright, needs the stack up
npm run test:all           # all three, in order

npm run test:watch
npm run test:ui
npm run test:coverage
```

## Mocks provided by `setup.js`

IntersectionObserver, PerformanceObserver, `fetch`, localStorage,
sessionStorage, the `Image` constructor and `matchMedia`.

`$env/dynamic/private` is aliased to `mocks/env.js` for both Vitest projects, so
importing a server module in a test does not blow up on missing SvelteKit
runtime environment.

## Conventions

- One behaviour per test, named for the behaviour rather than the function.
- Reset module state between tests when the module under test holds any. The
  ROMM client caches a token at module scope, so its tests re-import through
  `vi.resetModules()` rather than sharing an instance.
- Never reach the network, including in e2e — those run against the local stack,
  never a remote one.
- When a test needs a fixture user or game, use the seeded ones rather than
  creating new state.
