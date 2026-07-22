import { LeakSuspect, PerformanceObserverSummary } from './types';

export class PerformanceObserverTracker {
  private observer: PerformanceObserver | null = null;
  private summary: PerformanceObserverSummary = {
    longTasks: 0,
    totalLongTaskDuration: 0,
    lastLongTaskDuration: 0,
    observations: 0
  };

  constructor() {
    this.setupObserver();
  }

  private setupObserver(): void {
    if (typeof PerformanceObserver === 'undefined') {
      return;
    }

    this.observer = new PerformanceObserver((list: PerformanceObserverEntryList) => {
      list.getEntries().forEach((entry) => {
        this.recordSample(entry);
      });
    });

    this.observer.observe({ entryTypes: ['longtask', 'event', 'navigation'] });
  }

  recordSample(entry: PerformanceEntry): void {
    this.summary.observations += 1;

    if (entry.entryType === 'longtask') {
      const duration = entry.duration || 0;
      this.summary.longTasks += 1;
      this.summary.totalLongTaskDuration += duration;
      this.summary.lastLongTaskDuration = duration;
    }
  }

  getSummary(): PerformanceObserverSummary {
    return { ...this.summary };
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];

    if (this.summary.longTasks > 0 && this.summary.lastLongTaskDuration > 200) {
      suspects.push({
        type: 'closure',
        severity: this.summary.lastLongTaskDuration > 500 ? 'high' : 'medium',
        description: `Performance Observer detected a long task lasting ${this.summary.lastLongTaskDuration.toFixed(0)}ms`,
        count: this.summary.longTasks
      });
    }

    return suspects;
  }

  cleanup(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.summary = {
      longTasks: 0,
      totalLongTaskDuration: 0,
      lastLongTaskDuration: 0,
      observations: 0
    };
  }
}
