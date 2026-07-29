// Mock for $env/dynamic/public. SvelteKit routes PUBLIC_-prefixed variables
// here and deliberately omits them from $env/dynamic/private, so any module
// reading one needs this counterpart to the private mock in ./env.js.
//
// Deliberately empty: tests assign the keys they need and delete them again,
// which is also how they assert that a value is absent.
export const env = {};
