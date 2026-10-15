import { TimerTracker } from '../timer-tracker';

describe('TimerTracker', () => {
  let tracker: TimerTracker;

  beforeEach(() => {
    jest.useFakeTimers();
    tracker = new TimerTracker();
  });

  afterEach(() => {
    tracker.cleanup();
    jest.useRealTimers();
  });

  test('should track active timeouts and remove them when executed', () => {
    let executed = false;
    setTimeout(() => {
      executed = true;
    }, 100);

    expect(tracker.getActiveTimeoutsCount()).toBe(1);
    expect(tracker.getActiveTimers()).toBe(1);

    // Fast-forward time so timeout executes
    jest.advanceTimersByTime(100);

    expect(executed).toBe(true);
    // Timeout should have automatically removed itself from tracker upon completion!
    expect(tracker.getActiveTimeoutsCount()).toBe(0);
    expect(tracker.getActiveTimers()).toBe(0);
  });

  test('should remove timeout when clearTimeout is called', () => {
    const id = setTimeout(() => {}, 5000);
    expect(tracker.getActiveTimeoutsCount()).toBe(1);

    clearTimeout(id);
    expect(tracker.getActiveTimeoutsCount()).toBe(0);
  });

  test('should track intervals and remove when clearInterval is called', () => {
    const id = setInterval(() => {}, 1000);
    expect(tracker.getActiveIntervalsCount()).toBe(1);

    clearInterval(id);
    expect(tracker.getActiveIntervalsCount()).toBe(0);
  });

  test('should detect excessive intervals as potential leak', () => {
    for (let i = 0; i < 20; i++) {
      setInterval(() => {}, 1000);
    }

    const suspects = tracker.detectLeaks();
    const intervalSuspect = suspects.find(s => s.type === 'timer' && s.description.includes('setInterval'));
    expect(intervalSuspect).toBeDefined();
    expect(intervalSuspect?.count).toBe(20);
  });

  test('cleanup restores original timer functions', () => {
    tracker.cleanup();
    expect(tracker.getActiveTimers()).toBe(0);
  });
});
