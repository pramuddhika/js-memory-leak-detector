import { LeakSuspect } from './types';

export interface UnmountedCanaryRecord {
  componentName: string;
  ref: WeakRef<object>;
  unmountedAt: number;
  reported: boolean;
  metadata?: Record<string, any>;
}

export class ReactTracker {
  private trackedCanaries: UnmountedCanaryRecord[] = [];
  private finalizationRegistry?: FinalizationRegistry<UnmountedCanaryRecord>;
  private checkGracePeriodMs: number;
  private maxTrackedCanaries: number;

  constructor(options: { checkGracePeriodMs?: number; maxTracked?: number } = {}) {
    this.checkGracePeriodMs = options.checkGracePeriodMs ?? 15000; // 15s grace period for GC
    this.maxTrackedCanaries = options.maxTracked ?? 100;

    if (typeof FinalizationRegistry !== 'undefined') {
      this.finalizationRegistry = new FinalizationRegistry<UnmountedCanaryRecord>((record) => {
        // Canary was garbage-collected! Component tree was safely freed.
        this.trackedCanaries = this.trackedCanaries.filter((c) => c !== record);
      });
    }
  }

  /**
   * Register an unmounted component canary to observe whether it gets garbage collected.
   * If the canary is still referenced after the grace period, it indicates a retained component tree
   * or a stale closure holding the unmounted component's scope.
   */
  registerUnmountedCanary(
    componentName: string,
    canaryTarget: object,
    metadata?: Record<string, any>
  ): void {
    if (typeof WeakRef === 'undefined' || !canaryTarget) {
      return;
    }

    // Prune existing collected entries
    this.prune();

    if (this.trackedCanaries.length >= this.maxTrackedCanaries) {
      this.trackedCanaries.shift();
    }

    const record: UnmountedCanaryRecord = {
      componentName,
      ref: new WeakRef(canaryTarget),
      unmountedAt: Date.now(),
      reported: false,
      metadata
    };

    this.trackedCanaries.push(record);

    if (this.finalizationRegistry) {
      try {
        this.finalizationRegistry.register(canaryTarget, record, record);
      } catch {
        // Ignore registration failure if target is invalid
      }
    }
  }

  private prune(): UnmountedCanaryRecord[] {
    const alive: UnmountedCanaryRecord[] = [];
    for (const record of this.trackedCanaries) {
      if (record.ref.deref()) {
        alive.push(record);
      }
    }
    this.trackedCanaries = alive;
    return alive;
  }

  getRetainedComponentsCount(): number {
    const now = Date.now();
    return this.prune().filter(r => now - r.unmountedAt > this.checkGracePeriodMs).length;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const now = Date.now();
    const live = this.prune();

    for (const record of live) {
      const elapsed = now - record.unmountedAt;
      if (elapsed > this.checkGracePeriodMs) {
        suspects.push({
          type: 'retained-component',
          severity: elapsed > 60000 ? 'critical' : 'high',
          description: `React component <${record.componentName}> unmounted ${(elapsed / 1000).toFixed(0)}s ago but its instance/closures are still retained in memory`,
          count: 1,
          details: {
            componentName: record.componentName,
            unmountedSecondsAgo: Math.round(elapsed / 1000),
            metadata: record.metadata
          },
          devToolsHint: `Open Chrome DevTools -> Memory -> Take Heap Snapshot -> Search for "${record.componentName}" or inspect Retainers tree to see which closure/listener holds it.`
        });
        record.reported = true;
      }
    }

    return suspects;
  }

  cleanup(): void {
    this.trackedCanaries = [];
  }
}

// React Hook integration helper (usable in React applications)
export function createReactCanaryHook(tracker: ReactTracker, customReact?: any) {
  return function useRetainedComponentCanary(
    componentName: string,
    metadata?: Record<string, any>
  ): void {
    if (typeof window === 'undefined') return;

    // Dynamically verify React presence (passed instance or window/globalThis fallback)
    const React =
      customReact ||
      (globalThis as any).React ||
      (typeof window !== 'undefined' && (window as any).React);

    if (!React || typeof React.useEffect !== 'function') {
      return;
    }

    React.useEffect(() => {
      // Allocate lightweight canary token scoped to this component render lifecycle
      const canaryToken = {
        _component: componentName,
        _createdAt: Date.now()
      };

      return () => {
        // Component is unmounting. Register canary to monitor GC retention.
        tracker.registerUnmountedCanary(componentName, canaryToken, metadata);
      };
    }, [componentName]);
  };
}
