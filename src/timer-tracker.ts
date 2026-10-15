import { LeakSuspect } from './types';

interface TrackedTimer {
  id: any;
  type: 'timeout' | 'interval';
  delay: number;
  created: number;
  stack?: string;
}

export class TimerTracker {
  private timers: Map<any, TrackedTimer> = new Map();
  private originalSetTimeout: any;
  private originalSetInterval: any;
  private originalClearTimeout: any;
  private originalClearInterval: any;
  private captureStackTrace: boolean;

  constructor(options: { captureStackTrace?: boolean } = {}) {
    this.captureStackTrace = options.captureStackTrace ?? false;
    this.originalSetTimeout = (globalThis as any).setTimeout;
    this.originalSetInterval = (globalThis as any).setInterval;
    this.originalClearTimeout = (globalThis as any).clearTimeout;
    this.originalClearInterval = (globalThis as any).clearInterval;
    this.patchTimers();
  }

  private patchTimers(): void {
    const self = this;

    (globalThis as any).setTimeout = function(handler: any, timeout = 0, ...args: any[]): any {
      const delay = typeof timeout === 'number' ? timeout : 0;
      let id: any;

      // Wrap handler so once it executes to completion, it removes itself from tracking
      const wrappedHandler = typeof handler === 'function'
        ? function(...callbackArgs: any[]) {
            try {
              return handler(...callbackArgs);
            } finally {
              // Automatically remove completed timeout from tracker!
              self.timers.delete(id);
            }
          }
        : handler;

      id = self.originalSetTimeout.call(globalThis, wrappedHandler, timeout, ...args);

      self.timers.set(id, {
        id,
        type: 'timeout',
        delay,
        created: Date.now(),
        stack: self.captureStackTrace ? new Error().stack : undefined
      });

      return id;
    };

    (globalThis as any).setInterval = function(handler: any, timeout = 0, ...args: any[]): any {
      const delay = typeof timeout === 'number' ? timeout : 0;
      const id = self.originalSetInterval.call(globalThis, handler, timeout, ...args);

      self.timers.set(id, {
        id,
        type: 'interval',
        delay,
        created: Date.now(),
        stack: self.captureStackTrace ? new Error().stack : undefined
      });

      return id;
    };

    (globalThis as any).clearTimeout = function(id?: any): void {
      if (id !== undefined && id !== null) {
        self.timers.delete(id);
      }
      return self.originalClearTimeout.call(globalThis, id);
    };

    (globalThis as any).clearInterval = function(id?: any): void {
      if (id !== undefined && id !== null) {
        self.timers.delete(id);
      }
      return self.originalClearInterval.call(globalThis, id);
    };
  }

  getActiveTimers(): number {
    return this.timers.size;
  }

  getActiveIntervalsCount(): number {
    let count = 0;
    for (const timer of this.timers.values()) {
      if (timer.type === 'interval') count++;
    }
    return count;
  }

  getActiveTimeoutsCount(): number {
    let count = 0;
    for (const timer of this.timers.values()) {
      if (timer.type === 'timeout') count++;
    }
    return count;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const now = Date.now();
    const longRunningIntervalThreshold = 5 * 60 * 1000; // 5 minutes

    let activeIntervals = 0;
    let oldIntervals = 0;
    let pendingTimeouts = 0;

    for (const timer of this.timers.values()) {
      if (timer.type === 'interval') {
        activeIntervals++;
        if (now - timer.created > longRunningIntervalThreshold) {
          oldIntervals++;
        }
      } else {
        pendingTimeouts++;
      }
    }

    // Flag excessive active intervals (often created in components without clearInterval on unmount)
    if (activeIntervals > 15) {
      suspects.push({
        type: 'timer',
        severity: activeIntervals > 50 ? 'critical' : 'high',
        description: `${activeIntervals} active setInterval instances detected (possible missing clearInterval in useEffect cleanup)`,
        count: activeIntervals,
        devToolsHint: 'Check React useEffect hooks returning intervals; ensure clearInterval is returned in the cleanup callback.'
      });
    } else if (oldIntervals > 5) {
      suspects.push({
        type: 'timer',
        severity: 'medium',
        description: `${oldIntervals} setInterval instances running continuously for > 5 minutes`,
        count: oldIntervals,
        devToolsHint: 'Verify long-lived intervals in background loops or components that were expected to unmount.'
      });
    }

    // Flag huge backlogs of unexecuted pending timeouts
    if (pendingTimeouts > 100) {
      suspects.push({
        type: 'timer',
        severity: pendingTimeouts > 500 ? 'critical' : 'high',
        description: `${pendingTimeouts} pending setTimeout instances queued`,
        count: pendingTimeouts,
        devToolsHint: 'Check debounce or throttle functions that repeatedly queue timeouts without canceling existing timers.'
      });
    }

    return suspects;
  }

  cleanup(): void {
    (globalThis as any).setTimeout = this.originalSetTimeout;
    (globalThis as any).setInterval = this.originalSetInterval;
    (globalThis as any).clearTimeout = this.originalClearTimeout;
    (globalThis as any).clearInterval = this.originalClearInterval;
    this.timers.clear();
  }
}
