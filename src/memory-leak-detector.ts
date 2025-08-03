import { DetectorConfig, MemoryLeakReport, MemorySnapshot, LeakSuspect } from './types';
import { EventListenerTracker } from './event-listener-tracker';
import { TimerTracker } from './timer-tracker';
import { DOMTracker } from './dom-tracker';
import { ReduxTracker } from './redux-tracker';

export class MemoryLeakDetector {
  private config: Required<DetectorConfig>;
  private eventTracker?: EventListenerTracker;
  private timerTracker?: TimerTracker;
  private domTracker?: DOMTracker;
  private reduxTracker?: ReduxTracker;
  private snapshots: MemorySnapshot[] = [];
  private reportInterval?: number;
  private isRunning = false;

  constructor(config: DetectorConfig = {}) {
    this.config = {
      enableEventListenerTracking: config.enableEventListenerTracking ?? true,
      enableTimerTracking: config.enableTimerTracking ?? true,
      enableDOMTracking: config.enableDOMTracking ?? true,
      enableReduxTracking: config.enableReduxTracking ?? true,
      enablePerformanceObserver: config.enablePerformanceObserver ?? true,
      reportInterval: config.reportInterval ?? 30000, // 30 seconds
      memoryThreshold: config.memoryThreshold ?? 300, // 300MB
      onReport: config.onReport ?? (() => {}),
      onLeak: config.onLeak ?? (() => {})
    };

    this.init();
  }

  private init(): void {
    if (this.config.enableEventListenerTracking) {
      this.eventTracker = new EventListenerTracker();
    }

    if (this.config.enableTimerTracking) {
      this.timerTracker = new TimerTracker();
    }

    if (this.config.enableDOMTracking) {
      this.domTracker = new DOMTracker();
    }

    if (this.config.enableReduxTracking) {
      this.reduxTracker = new ReduxTracker();
    }
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Take initial snapshot
    this.takeSnapshot();

    // Set up periodic reporting
    this.reportInterval = (globalThis as any).setInterval(() => {
      this.generateReport();
    }, this.config.reportInterval);

    console.log('🔍 Memory Leak Detector started');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.reportInterval) {
      (globalThis as any).clearInterval(this.reportInterval);
      this.reportInterval = undefined;
    }

    console.log('🛑 Memory Leak Detector stopped');
  }

  private getMemoryInfo(): any {
    // Try different ways to get memory info
    if ((performance as any).memory) {
      return (performance as any).memory;
    }
    
    // Fallback for environments without performance.memory
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0
    };
  }

  private takeSnapshot(): MemorySnapshot {
    const memory = this.getMemoryInfo();
    
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      memory: {
        heapUsed: memory.usedJSHeapSize || 0,
        heapTotal: memory.totalJSHeapSize || 0,
        external: memory.external || 0,
        arrayBuffers: memory.arrayBuffers || 0
      },
      counts: {
        eventListeners: this.eventTracker?.getActiveListeners() || 0,
        timers: this.timerTracker?.getActiveTimers() || 0,
        domNodes: this.domTracker?.getDOMNodeCount() || 0,
        detachedNodes: this.domTracker?.getDetachedNodeCount() || 0
      }
    };

    this.snapshots.push(snapshot);
    
    // Keep only last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }

    return snapshot;
  }

  private detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];

    // Collect suspects from all trackers
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

    // Analyze memory growth
    if (this.snapshots.length >= 2) {
      const latest = this.snapshots[this.snapshots.length - 1];
      const previous = this.snapshots[this.snapshots.length - 2];
      
      const memoryGrowth = latest.memory.heapUsed - previous.memory.heapUsed;
      const growthMB = memoryGrowth / (1024 * 1024);

      if (growthMB > 10) { // 10MB growth
        suspects.push({
          type: 'closure',
          severity: growthMB > 50 ? 'critical' : 'high',
          description: `Memory increased by ${growthMB.toFixed(2)}MB in ${this.config.reportInterval / 1000}s`,
          count: Math.round(growthMB)
        });
      }
    }

    return suspects;
  }

  private generateRecommendations(suspects: LeakSuspect[]): string[] {
    const recommendations: string[] = [];

    suspects.forEach(suspect => {
      switch (suspect.type) {
        case 'event-listener':
          recommendations.push('Remove event listeners when components unmount or are no longer needed');
          break;
        case 'timer':
          recommendations.push('Clear intervals and timeouts when they are no longer needed');
          break;
        case 'dom-reference':
          recommendations.push('Avoid keeping references to DOM elements after they are removed');
          break;
        case 'detached-dom':
          recommendations.push('Check for detached DOM nodes that should be garbage collected');
          break;
        case 'closure':
          recommendations.push('Review closures that might be holding references to large objects');
          break;
        case 'redux-subscription':
          recommendations.push('Ensure Redux store subscriptions are properly unsubscribed when components unmount');
          break;
        case 'redux-selector':
          recommendations.push('Check for infinite re-renders caused by improperly memoized selectors');
          break;
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  generateReport(): MemoryLeakReport {
    const snapshot = this.takeSnapshot();
    const suspects = this.detectLeaks();
    const recommendations = this.generateRecommendations(suspects);

    const report: MemoryLeakReport = {
      timestamp: snapshot.timestamp,
      heapUsed: snapshot.memory.heapUsed,
      heapTotal: snapshot.memory.heapTotal,
      external: snapshot.memory.external,
      arrayBuffers: snapshot.memory.arrayBuffers,
      leakSuspects: suspects,
      recommendations
    };

    // Notify about individual leaks
    suspects.forEach(suspect => {
      this.config.onLeak(suspect);
    });

    // Send report
    this.config.onReport(report);

    return report;
  }

  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  // Public methods for Redux integration
  patchReduxStore(store: any): void {
    if (this.reduxTracker) {
      this.reduxTracker.patchStore(store);
    }
  }

  trackSelectorUsage(selectorName: string): void {
    if (this.reduxTracker) {
      this.reduxTracker.trackSelectorUsage(selectorName);
    }
  }

  cleanup(): void {
    this.stop();
    
    this.eventTracker?.cleanup();
    this.timerTracker?.cleanup();
    this.domTracker?.cleanup();
    this.reduxTracker?.cleanup();
    
    this.snapshots = [];
  }
}
