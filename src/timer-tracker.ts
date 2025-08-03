import { LeakSuspect } from './types';

export class TimerTracker {
  private timers: Map<any, { type: 'timeout' | 'interval'; created: number; stack?: string }> = new Map();
  private originalSetTimeout: any;
  private originalSetInterval: any;
  private originalClearTimeout: any;
  private originalClearInterval: any;

  constructor() {
    this.originalSetTimeout = (globalThis as any).setTimeout;
    this.originalSetInterval = (globalThis as any).setInterval;
    this.originalClearTimeout = (globalThis as any).clearTimeout;
    this.originalClearInterval = (globalThis as any).clearInterval;
    this.patchTimers();
  }

  private patchTimers(): void {
    const self = this;

    (globalThis as any).setTimeout = function(handler: any, timeout?: number, ...args: any[]): any {
      const id = self.originalSetTimeout.call(globalThis, handler, timeout, ...args);
      
      self.timers.set(id, {
        type: 'timeout',
        created: Date.now(),
        stack: new Error().stack
      });
      
      return id;
    };

    (globalThis as any).setInterval = function(handler: any, timeout?: number, ...args: any[]): any {
      const id = self.originalSetInterval.call(globalThis, handler, timeout, ...args);
      
      self.timers.set(id, {
        type: 'interval',
        created: Date.now(),
        stack: new Error().stack
      });
      
      return id;
    };

    (globalThis as any).clearTimeout = function(id?: any): void {
      if (id) {
        self.timers.delete(id);
      }
      return self.originalClearTimeout.call(globalThis, id);
    };

    (globalThis as any).clearInterval = function(id?: any): void {
      if (id) {
        self.timers.delete(id);
      }
      return self.originalClearInterval.call(globalThis, id);
    };
  }

  getActiveTimers(): number {
    return this.timers.size;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const now = Date.now();
    const oldTimerThreshold = 5 * 60 * 1000; // 5 minutes

    let oldTimers = 0;
    let totalIntervals = 0;

    for (const [id, timer] of this.timers) {
      if (timer.type === 'interval') {
        totalIntervals++;
      }

      if (now - timer.created > oldTimerThreshold) {
        oldTimers++;
      }
    }

    if (oldTimers > 10) {
      suspects.push({
        type: 'timer',
        severity: oldTimers > 50 ? 'critical' : 'high',
        description: `${oldTimers} timers running for more than 5 minutes`,
        count: oldTimers
      });
    }

    if (totalIntervals > 20) {
      suspects.push({
        type: 'timer',
        severity: totalIntervals > 100 ? 'critical' : 'medium',
        description: `${totalIntervals} active intervals detected`,
        count: totalIntervals
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
