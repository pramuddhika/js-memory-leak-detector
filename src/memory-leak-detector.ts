import {
  DetectorConfig,
  MemoryLeakReport,
  MemorySnapshot,
  LeakSuspect,
  MemoryApiKind
} from './types';
import { EventListenerTracker } from './event-listener-tracker';
import { TimerTracker } from './timer-tracker';
import { DOMTracker } from './dom-tracker';
import { ReduxTracker } from './redux-tracker';
import { ReactTracker, createReactCanaryHook } from './react-tracker';
import { DevToolsGuidance } from './devtools-guidance';

export class MemoryLeakDetector {
  private config: Required<DetectorConfig>;
  private eventTracker?: EventListenerTracker;
  private timerTracker?: TimerTracker;
  private domTracker?: DOMTracker;
  private reduxTracker?: ReduxTracker;
  private reactTracker?: ReactTracker;
  private snapshots: MemorySnapshot[] = [];
  private reportIntervalTimer?: any;
  private isRunning = false;
  private consecutiveGrowths = 0;

  constructor(config: DetectorConfig = {}) {
    this.config = {
      enableEventListenerTracking: config.enableEventListenerTracking ?? true,
      enableTimerTracking: config.enableTimerTracking ?? true,
      enableDOMTracking: config.enableDOMTracking ?? true,
      enableReduxTracking: config.enableReduxTracking ?? true,
      enableReactTracking: config.enableReactTracking ?? true,
      enablePerformanceObserver: config.enablePerformanceObserver ?? true,
      captureStackTrace: config.captureStackTrace ?? false,
      reportInterval: config.reportInterval ?? 30000, // 30 seconds
      memoryThreshold: config.memoryThreshold ?? 300, // 300MB
      maxDetachedNodeScan: config.maxDetachedNodeScan ?? 500,
      onReport: config.onReport ?? (() => {}),
      onLeak: config.onLeak ?? (() => {})
    };

    this.init();
  }

  private init(): void {
    if (this.config.enableEventListenerTracking) {
      this.eventTracker = new EventListenerTracker({
        captureStackTrace: this.config.captureStackTrace
      });
    }

    if (this.config.enableTimerTracking) {
      this.timerTracker = new TimerTracker({
        captureStackTrace: this.config.captureStackTrace
      });
    }

    if (this.config.enableDOMTracking) {
      this.domTracker = new DOMTracker(this.config.maxDetachedNodeScan);
    }

    if (this.config.enableReduxTracking) {
      this.reduxTracker = new ReduxTracker({
        captureStackTrace: this.config.captureStackTrace
      });
    }

    if (this.config.enableReactTracking) {
      this.reactTracker = new ReactTracker();
    }
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    // Take initial baseline snapshot
    this.takeSnapshot();

    // Set up periodic reporting
    this.reportIntervalTimer = (globalThis as any).setInterval(() => {
      this.generateReport();
    }, this.config.reportInterval);

    console.log('🔍 Memory Leak Detector started (Hint & Diagnostic Mode)');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.reportIntervalTimer !== undefined) {
      (globalThis as any).clearInterval(this.reportIntervalTimer);
      this.reportIntervalTimer = undefined;
    }

    console.log('🛑 Memory Leak Detector stopped');
  }

  getMemoryInfo(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    api: MemoryApiKind;
    isQuantized: boolean;
  } {
    // 1. Check legacy Chromium performance.memory
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      return {
        heapUsed: mem.usedJSHeapSize || 0,
        heapTotal: mem.totalJSHeapSize || 0,
        external: 0,
        arrayBuffers: 0,
        api: 'performance.memory',
        // In modern Chromium, performance.memory is quantized for privacy/anti-fingerprinting
        isQuantized: true
      };
    }

    // 2. Check Node.js process.memoryUsage (SSR / Tests / Tools)
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
      try {
        const mem = process.memoryUsage();
        return {
          heapUsed: mem.heapUsed || 0,
          heapTotal: mem.heapTotal || 0,
          external: mem.external || 0,
          arrayBuffers: mem.arrayBuffers || 0,
          api: 'process.memoryUsage',
          isQuantized: false
        };
      } catch {
        // Ignore fallback
      }
    }

    // 3. Fallback for Firefox, Safari, and environments without direct memory APIs
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0,
      api: 'none',
      isQuantized: false
    };
  }

  takeSnapshot(): MemorySnapshot {
    const memory = this.getMemoryInfo();

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
        api: memory.api
      },
      counts: {
        eventListeners: this.eventTracker?.getActiveListeners() || 0,
        timers: this.timerTracker?.getActiveTimers() || 0,
        domNodes: this.domTracker?.getDOMNodeCount() || 0,
        detachedNodes: this.domTracker?.getDetachedNodeCount() || 0,
        retainedComponents: this.reactTracker?.getRetainedComponentsCount() || 0
      }
    };

    this.snapshots.push(snapshot);

    // Keep only last 50 snapshots
    if (this.snapshots.length > 50) {
      this.snapshots = this.snapshots.slice(-50);
    }

    return snapshot;
  }

  private detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];

    // Collect suspects from individual trackers
    if (this.eventTracker) {
      suspects.push(...this.eventTracker.detectLeaks());
    }

    if (this.timerTracker) {
      suspects.push(...this.timerTracker.detectLeaks());
    }

    if (this.domTracker) {
      suspects.push(...this.domTracker.detectLeaks());
    }

    if (this.reduxTracker) {
      suspects.push(...this.reduxTracker.detectLeaks());
    }

    if (this.reactTracker) {
      suspects.push(...this.reactTracker.detectLeaks());
    }

    // Check memory API limitations and advise the developer
    const memInfo = this.getMemoryInfo();
    if (memInfo.api === 'none') {
      suspects.push({
        type: 'quantized-memory-notice',
        severity: 'low',
        description: 'Raw memory API unavailable in this browser (Firefox/Safari). Use Chrome DevTools -> Memory tab for profiling.',
        devToolsHint: 'Open Chrome or Edge DevTools -> Memory panel to take heap snapshots.'
      });
    } else if (memInfo.isQuantized) {
      // Mention quantization only once or if threshold is exceeded
      if (this.snapshots.length <= 1) {
        suspects.push({
          type: 'quantized-memory-notice',
          severity: 'low',
          description: 'performance.memory is coarse and quantized. Small leaks are only visible via Chrome DevTools Heap Snapshots.',
          devToolsHint: 'Use 3-snapshot heap comparison in Chrome DevTools to locate subtle leaks.'
        });
      }
    }

    // Analyze sustained memory growth across snapshots
    if (this.snapshots.length >= 2) {
      const latest = this.snapshots[this.snapshots.length - 1];
      const previous = this.snapshots[this.snapshots.length - 2];

      const memoryGrowth = latest.memory.heapUsed - previous.memory.heapUsed;
      const growthMB = memoryGrowth / (1024 * 1024);
      const totalMB = latest.memory.heapUsed / (1024 * 1024);

      if (growthMB > 25) {
        this.consecutiveGrowths++;
      } else if (growthMB < 0) {
        // GC occurred or memory dropped
        this.consecutiveGrowths = Math.max(0, this.consecutiveGrowths - 1);
      }

      // Check if memory has sustained rapid growth across 3+ snapshots
      if (this.consecutiveGrowths >= 3) {
        suspects.push({
          type: 'closure',
          severity: totalMB > this.config.memoryThreshold ? 'critical' : 'high',
          description: `Sustained heap growth detected across ${this.consecutiveGrowths} consecutive intervals (latest: +${growthMB.toFixed(1)}MB, total: ${totalMB.toFixed(1)}MB)`,
          count: Math.round(totalMB),
          devToolsHint: 'Chrome DevTools -> Memory -> Take Heap Snapshot -> Compare against initial snapshot to see growing constructors.'
        });
      } else if (totalMB > this.config.memoryThreshold) {
        suspects.push({
          type: 'closure',
          severity: 'critical',
          description: `Heap usage (${totalMB.toFixed(1)}MB) exceeded configured threshold of ${this.config.memoryThreshold}MB`,
          count: Math.round(totalMB),
          devToolsHint: 'Check for unbounded caches, global arrays, or large uncompressed assets retained in memory.'
        });
      }
    }

    return suspects;
  }

  private generateRecommendations(suspects: LeakSuspect[]): string[] {
    const recommendations: string[] = [];

    for (const suspect of suspects) {
      switch (suspect.type) {
        case 'event-listener':
          recommendations.push('Event Listeners: Ensure removeEventListener is called on unmount or use AbortController signal in useEffect.');
          break;
        case 'timer':
          recommendations.push('Timers: Ensure intervals and long timeouts return a clearInterval/clearTimeout cleanup callback in useEffect.');
          break;
        case 'dom-reference':
        case 'detached-dom':
          recommendations.push('Detached DOM: Avoid holding DOM element references in module-level variables or closures after elements are removed.');
          break;
        case 'retained-component':
          recommendations.push('Retained React Component: An unmounted component tree is still referenced by a stale closure, global listener, or store subscription.');
          break;
        case 'redux-subscription':
          recommendations.push('Redux Subscriptions: Ensure store.subscribe listeners unsubscribe when the enclosing component unmounts.');
          break;
        case 'redux-selector':
          recommendations.push('Redux Selectors: Memoize selectors with createSelector (Reselect) to avoid triggering infinite re-render cycles.');
          break;
        case 'closure':
          recommendations.push('Closures & Retainers: Review closures capturing outer scopes or large objects; profile using Chrome DevTools Heap Snapshot.');
          break;
        case 'quantized-memory-notice':
          recommendations.push('Profiling Guidance: Use Chrome DevTools Memory panel (Heap snapshot / Allocation timeline) for conclusive profiling before shipping.');
          break;
      }
    }

    return [...new Set(recommendations)];
  }

  generateReport(): MemoryLeakReport {
    const snapshot = this.takeSnapshot();
    const suspects = this.detectLeaks();
    const recommendations = this.generateRecommendations(suspects);
    const devToolsGuidance = DevToolsGuidance.formatDevToolsAdvice(suspects);
    const memInfo = this.getMemoryInfo();

    const report: MemoryLeakReport = {
      timestamp: snapshot.timestamp,
      heapUsed: snapshot.memory.heapUsed,
      heapTotal: snapshot.memory.heapTotal,
      external: snapshot.memory.external,
      arrayBuffers: snapshot.memory.arrayBuffers,
      memoryApi: memInfo.api,
      isMemoryQuantized: memInfo.isQuantized,
      leakSuspects: suspects,
      recommendations,
      devToolsGuidance
    };

    // Notify individual leak listeners
    for (const suspect of suspects) {
      this.config.onLeak(suspect);
    }

    // Send full report
    this.config.onReport(report);

    return report;
  }

  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  // React helpers
  getReactTracker(): ReactTracker | undefined {
    return this.reactTracker;
  }

  /**
   * Monitor an unmounted component canary object to see if it is garbage collected.
   */
  trackUnmountedComponent(componentName: string, target: object, metadata?: Record<string, any>): void {
    this.reactTracker?.registerUnmountedCanary(componentName, target, metadata);
  }

  /**
   * Creates a React hook for tracking unmounted component tree retention.
   * @param customReact Optional React instance for bundler environments where React is not global
   */
  createReactHook(customReact?: any): (componentName: string, metadata?: Record<string, any>) => void {
    if (!this.reactTracker) {
      return () => {};
    }
    return createReactCanaryHook(this.reactTracker, customReact);
  }

  // Redux helpers
  patchReduxStore(store: any): void {
    this.reduxTracker?.patchStore(store);
  }

  trackSelectorUsage(selectorName: string): void {
    this.reduxTracker?.trackSelectorUsage(selectorName);
  }

  // Static DevTools helpers
  static getProfilingWorkflow() {
    return DevToolsGuidance.getProfilingWorkflow();
  }

  static getReactReviewPatterns() {
    return DevToolsGuidance.getReactReviewPatterns();
  }

  cleanup(): void {
    this.stop();

    this.eventTracker?.cleanup();
    this.timerTracker?.cleanup();
    this.domTracker?.cleanup();
    this.reduxTracker?.cleanup();
    this.reactTracker?.cleanup();

    this.snapshots = [];
    this.consecutiveGrowths = 0;
  }
}
