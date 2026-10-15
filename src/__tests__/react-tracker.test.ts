import { ReactTracker } from '../react-tracker';

describe('ReactTracker', () => {
  let tracker: ReactTracker;

  beforeEach(() => {
    // 100ms grace period for tests
    tracker = new ReactTracker({ checkGracePeriodMs: 50 });
  });

  afterEach(() => {
    tracker.cleanup();
  });

  test('should detect retained component canary when object persists past grace period', async () => {
    // Create an object representing the component lifecycle token
    const canaryObject = { component: 'UserProfileModal', mountedAt: Date.now() };

    tracker.registerUnmountedCanary('UserProfileModal', canaryObject, { route: '/profile' });

    // Initially within grace period, should not be flagged
    let suspects = tracker.detectLeaks();
    expect(suspects.length).toBe(0);

    // Wait past the test grace period
    await new Promise(resolve => setTimeout(resolve, 80));

    suspects = tracker.detectLeaks();
    expect(suspects.length).toBe(1);
    expect(suspects[0].type).toBe('retained-component');
    expect(suspects[0].description).toContain('UserProfileModal');
    expect(suspects[0].devToolsHint).toContain('Heap Snapshot');
  });

  test('cleanup clears tracked canaries', () => {
    const canary = {};
    tracker.registerUnmountedCanary('Header', canary);
    tracker.cleanup();
    expect(tracker.getRetainedComponentsCount()).toBe(0);
  });
});
