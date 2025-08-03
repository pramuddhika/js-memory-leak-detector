export interface MemoryLeakReport {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  leakSuspects: LeakSuspect[];
  recommendations: string[];
}

export interface LeakSuspect {
  type: 'event-listener' | 'timer' | 'dom-reference' | 'closure' | 'detached-dom' | 'redux-subscription' | 'redux-selector';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  stackTrace?: string;
  element?: string;
  count?: number;
}

export interface DetectorConfig {
  enableEventListenerTracking?: boolean;
  enableTimerTracking?: boolean;
  enableDOMTracking?: boolean;
  enableReduxTracking?: boolean;
  enablePerformanceObserver?: boolean;
  reportInterval?: number; // milliseconds
  memoryThreshold?: number; // MB (default: 300MB)
  onReport?: (report: MemoryLeakReport) => void;
  onLeak?: (suspect: LeakSuspect) => void;
}

export interface MemorySnapshot {
  timestamp: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  counts: {
    eventListeners: number;
    timers: number;
    domNodes: number;
    detachedNodes: number;
  };
}
