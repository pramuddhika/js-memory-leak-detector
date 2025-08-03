import { LeakSuspect } from './types';

export class ReduxTracker {
  private storeSubscriptions: Map<any, { subscriber: Function; created: number; stack?: string }> = new Map();
  private selectorCalls: Map<string, { count: number; lastCalled: number }> = new Map();
  private originalStoreSubscribe?: Function;
  private storeRef?: any;

  constructor() {
    this.patchReduxStore();
  }

  private patchReduxStore(): void {
    // Wait for Redux store to be available
    if (typeof window !== 'undefined') {
      this.detectStoreFromWindow();
    }
  }

  private detectStoreFromWindow(): void {
    // Common ways Redux store is exposed
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

    // Also check for React DevTools Redux extension
    if ((window as any).__REDUX_DEVTOOLS_EXTENSION__) {
      this.setupDevToolsHook();
    }
  }

  patchStore(store: any): void {
    if (this.storeRef) return; // Already patched

    this.storeRef = store;
    this.originalStoreSubscribe = store.subscribe;
    const self = this;

    store.subscribe = function(listener: Function): Function {
      const unsubscribe = self.originalStoreSubscribe!.call(this, listener);
      
      // Track subscription
      const subscriptionId = Date.now() + Math.random();
      self.storeSubscriptions.set(subscriptionId, {
        subscriber: listener,
        created: Date.now(),
        stack: new Error().stack
      });

      // Return wrapped unsubscribe function
      return function() {
        self.storeSubscriptions.delete(subscriptionId);
        return unsubscribe();
      };
    };
  }

  private setupDevToolsHook(): void {
    // Hook into Redux DevTools to detect store creation
    const originalExtension = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
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
    const current = this.selectorCalls.get(selectorName) || { count: 0, lastCalled: 0 };
    this.selectorCalls.set(selectorName, {
      count: current.count + 1,
      lastCalled: Date.now()
    });
  }

  getActiveSubscriptions(): number {
    return this.storeSubscriptions.size;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const now = Date.now();

    // Check for excessive store subscriptions
    if (this.storeSubscriptions.size > 50) {
      suspects.push({
        type: 'redux-subscription',
        severity: this.storeSubscriptions.size > 200 ? 'critical' : 'high',
        description: `${this.storeSubscriptions.size} active Redux store subscriptions detected`,
        count: this.storeSubscriptions.size
      });
    }

    // Check for old subscriptions (component likely unmounted but didn't unsubscribe)
    let oldSubscriptions = 0;
    for (const [id, sub] of this.storeSubscriptions) {
      if (now - sub.created > 10 * 60 * 1000) { // 10 minutes
        oldSubscriptions++;
      }
    }

    if (oldSubscriptions > 10) {
      suspects.push({
        type: 'redux-subscription',
        severity: oldSubscriptions > 50 ? 'critical' : 'medium',
        description: `${oldSubscriptions} Redux subscriptions active for more than 10 minutes`,
        count: oldSubscriptions
      });
    }

    // Check for excessive selector calls (potential infinite re-renders)
    for (const [selector, stats] of this.selectorCalls) {
      if (stats.count > 1000 && now - stats.lastCalled < 60000) { // 1000 calls in last minute
        suspects.push({
          type: 'redux-selector',
          severity: stats.count > 5000 ? 'critical' : 'high',
          description: `Selector "${selector}" called ${stats.count} times recently (potential infinite re-render)`,
          count: stats.count
        });
      }
    }

    return suspects;
  }

  cleanup(): void {
    if (this.storeRef && this.originalStoreSubscribe) {
      this.storeRef.subscribe = this.originalStoreSubscribe;
    }
    
    this.storeSubscriptions.clear();
    this.selectorCalls.clear();
  }
}
