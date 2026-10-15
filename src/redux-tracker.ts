import { LeakSuspect } from './types';

interface TrackedSubscription {
  id: number;
  created: number;
  stack?: string;
}

export class ReduxTracker {
  private storeSubscriptions: Map<number, TrackedSubscription> = new Map();
  private selectorCalls: Map<string, { count: number; windowStart: number }> = new Map();
  private originalStoreSubscribe?: Function;
  private originalDevToolsExtension?: any;
  private storeRef?: any;
  private nextSubscriptionId = 1;
  private captureStackTrace: boolean;

  constructor(options: { captureStackTrace?: boolean } = {}) {
    this.captureStackTrace = options.captureStackTrace ?? false;
    this.patchReduxStore();
  }

  private patchReduxStore(): void {
    if (typeof window !== 'undefined') {
      this.detectStoreFromWindow();
    }
  }

  private detectStoreFromWindow(): void {
    const possibleStores = [
      (window as any).__REDUX_STORE__,
      (window as any).store,
      (window as any).__STORE__
    ];

    for (const store of possibleStores) {
      if (store && typeof store.subscribe === 'function') {
        this.patchStore(store);
        break;
      }
    }

    if ((window as any).__REDUX_DEVTOOLS_EXTENSION__) {
      this.setupDevToolsHook();
    }
  }

  patchStore(store: any): void {
    if (!store || typeof store.subscribe !== 'function') return;
    if (this.storeRef === store) return; // Already patched

    this.storeRef = store;
    this.originalStoreSubscribe = store.subscribe;
    const self = this;

    store.subscribe = function(listener: Function): Function {
      const unsubscribe = self.originalStoreSubscribe!.call(this, listener);
      const subscriptionId = self.nextSubscriptionId++;

      self.storeSubscriptions.set(subscriptionId, {
        id: subscriptionId,
        created: Date.now(),
        stack: self.captureStackTrace ? new Error().stack : undefined
      });

      // Return wrapped unsubscribe function
      return function() {
        self.storeSubscriptions.delete(subscriptionId);
        return unsubscribe();
      };
    };
  }

  private setupDevToolsHook(): void {
    if (this.originalDevToolsExtension) return;

    this.originalDevToolsExtension = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
    const originalExtension = this.originalDevToolsExtension;
    const self = this;

    (window as any).__REDUX_DEVTOOLS_EXTENSION__ = function(...args: any[]) {
      const enhancer = originalExtension.apply(this, args);

      return function(createStore: Function) {
        return function(reducer: any, preloadedState?: any) {
          const store = createStore(reducer, preloadedState);
          self.patchStore(store);
          return store;
        };
      };
    };
  }

  trackSelectorUsage(selectorName: string): void {
    const now = Date.now();
    const current = this.selectorCalls.get(selectorName);

    if (!current || now - current.windowStart > 60000) {
      // Reset sliding 60-second window
      this.selectorCalls.set(selectorName, { count: 1, windowStart: now });
    } else {
      current.count++;
    }
  }

  getActiveSubscriptions(): number {
    return this.storeSubscriptions.size;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const now = Date.now();
    const activeCount = this.storeSubscriptions.size;

    // Check for excessive active store subscriptions
    if (activeCount > 80) {
      suspects.push({
        type: 'redux-subscription',
        severity: activeCount > 250 ? 'critical' : 'high',
        description: `${activeCount} active Redux store subscriptions detected (possible unmounted components failing to unsubscribe)`,
        count: activeCount,
        devToolsHint: 'Check React-Redux useSelector or store.subscribe in custom hooks; verify unsubscribe on unmount.'
      });
    }

    // Check for subscriptions that have remained active for > 15 minutes
    let veryOldSubscriptions = 0;
    for (const sub of this.storeSubscriptions.values()) {
      if (now - sub.created > 15 * 60 * 1000) {
        veryOldSubscriptions++;
      }
    }

    if (veryOldSubscriptions > 15) {
      suspects.push({
        type: 'redux-subscription',
        severity: 'medium',
        description: `${veryOldSubscriptions} Redux subscriptions active for > 15 minutes`,
        count: veryOldSubscriptions,
        devToolsHint: 'Check if route/page navigation is tearing down component subscriptions.'
      });
    }

    // Check for excessive selector re-computations in sliding window
    for (const [selector, stats] of this.selectorCalls) {
      if (stats.count > 1500) {
        suspects.push({
          type: 'redux-selector',
          severity: stats.count > 5000 ? 'critical' : 'high',
          description: `Selector "${selector}" computed ${stats.count} times in the last minute (possible infinite re-render loop or unmemoized selector returning new object reference)`,
          count: stats.count,
          devToolsHint: 'Use createSelector (Reselect) with proper memoization; avoid returning newly created arrays/objects in selectors.'
        });
      }
    }

    return suspects;
  }

  cleanup(): void {
    if (this.storeRef && this.originalStoreSubscribe) {
      this.storeRef.subscribe = this.originalStoreSubscribe;
      this.storeRef = undefined;
    }

    if (typeof window !== 'undefined' && this.originalDevToolsExtension) {
      (window as any).__REDUX_DEVTOOLS_EXTENSION__ = this.originalDevToolsExtension;
      this.originalDevToolsExtension = undefined;
    }

    this.storeSubscriptions.clear();
    this.selectorCalls.clear();
  }
}
