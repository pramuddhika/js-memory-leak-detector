import { MemoryLeakDetector } from '../memory-leak-detector';

describe('MemoryLeakDetector', () => {
  let detector: MemoryLeakDetector;

  afterEach(() => {
    detector?.cleanup();
  });

  test('should initialize with default config and produce a report', () => {
    detector = new MemoryLeakDetector({
      reportInterval: 5000,
      enableEventListenerTracking: true,
      enableTimerTracking: true,
      enableDOMTracking: false,
      enableReduxTracking: false,
      enableReactTracking: true
    });

    const report = detector.generateReport();
    expect(report).toBeDefined();
    expect(report.timestamp).toBeGreaterThan(0);
    expect(Array.isArray(report.leakSuspects)).toBe(true);
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(Array.isArray(report.devToolsGuidance)).toBe(true);
  });

  test('should handle start and stop lifecycle', () => {
    detector = new MemoryLeakDetector({ reportInterval: 10000 });
    detector.start();
    const snapshots = detector.getSnapshots();
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    detector.stop();
  });

  test('should allow registering unmounted React components', () => {
    detector = new MemoryLeakDetector();
    const canary = { id: 1 };
    expect(() => {
      detector.trackUnmountedComponent('TestCard', canary);
    }).not.toThrow();
  });

  test('should provide static DevTools guidance and React patterns', () => {
    const workflow = MemoryLeakDetector.getProfilingWorkflow();
    expect(workflow.length).toBeGreaterThan(0);

    const patterns = MemoryLeakDetector.getReactReviewPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].name).toContain('AbortController');
  });
});
