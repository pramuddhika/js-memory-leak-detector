import { DOMTracker } from '../dom-tracker';

describe('DOMTracker', () => {
  let tracker: DOMTracker;

  beforeEach(() => {
    tracker = new DOMTracker();
  });

  afterEach(() => {
    tracker.cleanup();
  });

  test('should count DOM nodes in document', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const count = tracker.getDOMNodeCount();
    expect(count).toBeGreaterThan(0);

    document.body.removeChild(div);
  });

  test('should detect DOM bloat if node count is excessive', () => {
    // Mock getDOMNodeCount to simulate excessive nodes
    jest.spyOn(tracker, 'getDOMNodeCount').mockReturnValue(20000);

    const suspects = tracker.detectLeaks();
    const bloat = suspects.find(s => s.type === 'dom-reference');
    expect(bloat).toBeDefined();
    expect(bloat?.count).toBe(20000);
  });

  test('cleanup disconnects mutation observer and clears tracked nodes', () => {
    tracker.cleanup();
    expect(tracker.getDetachedNodeCount()).toBe(0);
  });
});
