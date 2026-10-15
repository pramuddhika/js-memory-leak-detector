import { EventListenerTracker } from '../event-listener-tracker';

describe('EventListenerTracker', () => {
  let tracker: EventListenerTracker;

  beforeEach(() => {
    tracker = new EventListenerTracker();
  });

  afterEach(() => {
    tracker.cleanup();
  });

  test('should track event listeners and remove when removeEventListener is called', () => {
    const button = document.createElement('button');
    const handler = () => {};

    button.addEventListener('click', handler);
    expect(tracker.getActiveListeners()).toBe(1);

    button.removeEventListener('click', handler);
    expect(tracker.getActiveListeners()).toBe(0);
  });

  test('should automatically remove listener when { once: true } triggers', () => {
    const button = document.createElement('button');
    let fired = false;
    const handler = () => {
      fired = true;
    };

    button.addEventListener('click', handler, { once: true });
    expect(tracker.getActiveListeners()).toBe(1);

    button.dispatchEvent(new Event('click'));
    expect(fired).toBe(true);

    // Should be automatically untracked after the single event invocation
    expect(tracker.getActiveListeners()).toBe(0);
  });

  test('should allow removeEventListener to cancel a { once: true } listener before firing', () => {
    const button = document.createElement('button');
    let fired = false;
    const handler = () => {
      fired = true;
    };

    button.addEventListener('click', handler, { once: true });
    expect(tracker.getActiveListeners()).toBe(1);

    button.removeEventListener('click', handler);
    expect(tracker.getActiveListeners()).toBe(0);

    button.dispatchEvent(new Event('click'));
    expect(fired).toBe(false);
  });

  test('should automatically remove listener when AbortController signal aborts', () => {
    const controller = new AbortController();
    const button = document.createElement('button');
    const handler = () => {};

    button.addEventListener('click', handler, { signal: controller.signal });
    expect(tracker.getActiveListeners()).toBe(1);

    controller.abort();
    expect(tracker.getActiveListeners()).toBe(0);
  });

  test('should flag excessive listeners on window or document', () => {
    const handlers: (() => void)[] = [];
    for (let i = 0; i < 30; i++) {
      const h = () => {};
      handlers.push(h);
      window.addEventListener('resize', h);
    }

    const suspects = tracker.detectLeaks();
    const windowSuspect = suspects.find(s => s.type === 'event-listener' && s.description.includes('window'));
    expect(windowSuspect).toBeDefined();

    // Clean up test listeners
    handlers.forEach(h => window.removeEventListener('resize', h));
  });
});
