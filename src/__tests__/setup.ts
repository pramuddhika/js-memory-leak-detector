// Jest test setup file
// Polyfill or provide test environment defaults if needed

if (typeof globalThis.MutationObserver === 'undefined') {
  // jsdom usually provides MutationObserver, but fallback if needed
  class MockMutationObserver {
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  (globalThis as any).MutationObserver = MockMutationObserver;
}
