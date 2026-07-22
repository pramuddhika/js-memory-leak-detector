import { PerformanceObserverTracker } from '../performance-observer-tracker';

describe('PerformanceObserverTracker', () => {
  it('records long-task activity and returns a summary', () => {
    const observe = jest.fn();
    const disconnect = jest.fn();

    class MockPerformanceObserver {
      public callback: PerformanceObserverCallback;

      constructor(callback: PerformanceObserverCallback) {
        this.callback = callback;
      }

      observe = observe;
      disconnect = disconnect;
    }

    const originalPerformanceObserver = global.PerformanceObserver;
    (global as typeof globalThis & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver = MockPerformanceObserver as unknown as typeof PerformanceObserver;

    const tracker = new PerformanceObserverTracker();

    tracker.recordSample({
      entryType: 'longtask',
      name: 'longtask',
      duration: 250,
      startTime: 100
    } as PerformanceEntry);

    const summary = tracker.getSummary();
    expect(observe).toHaveBeenCalledWith({ entryTypes: ['longtask', 'event', 'navigation'] });
    expect(summary.longTasks).toBe(1);
    expect(summary.totalLongTaskDuration).toBe(250);
    expect(summary.lastLongTaskDuration).toBe(250);

    tracker.cleanup();
    expect(disconnect).toHaveBeenCalled();

    (global as typeof globalThis & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver = originalPerformanceObserver;
  });
});
