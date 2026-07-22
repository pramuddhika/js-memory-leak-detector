const { PerformanceObserverTracker } = require('../dist/performance-observer-tracker');

describe('PerformanceObserverTracker', () => {
  it('records long-task observations and exposes a summary', () => {
    const observe = jest.fn();
    const disconnect = jest.fn();

    class MockPerformanceObserver {
      constructor(callback) {
        this.callback = callback;
      }

      observe = observe;
      disconnect = disconnect;
    }

    global.PerformanceObserver = MockPerformanceObserver;

    const tracker = new PerformanceObserverTracker();

    expect(observe).toHaveBeenCalledWith({ entryTypes: ['longtask', 'event', 'navigation'] });

    tracker.recordSample({
      entryType: 'longtask',
      name: 'longtask',
      duration: 250,
      startTime: 100
    });

    const summary = tracker.getSummary();
    expect(summary.longTasks).toBe(1);
    expect(summary.totalLongTaskDuration).toBe(250);
    expect(summary.lastLongTaskDuration).toBe(250);

    tracker.cleanup();
    expect(disconnect).toHaveBeenCalled();
  });
});
