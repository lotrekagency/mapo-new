/**
 * Placeholder for Nuxt's `#app` in component tests. Nuxt provides `#app` only
 * inside a Nuxt build, but the client transform must resolve every import, so
 * `vitest.config.ts` points `#app` here. It exports nothing on purpose: each test
 * replaces it with `vi.mock("#app", factory)`, holding the composables the
 * component under test calls.
 */
export {};
