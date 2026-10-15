export type LeakSuspectType =
  | 'event-listener'
  | 'timer'
  | 'dom-reference'
  | 'closure'
  | 'detached-dom'
  | 'redux-subscription'
  | 'redux-selector'
  | 'retained-component'
  | 'uncleaned-effect'
  | 'quantized-memory-notice';

export type LeakSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface LeakSuspect {
  type: LeakSuspectType;
  severity: LeakSeverity;
  description: string;
  stackTrace?: string;
  element?: string;
  count?: number;
  details?: Record<string, any>;
  devToolsHint?: string;
}

export type MemoryApiKind =
  | 'measureUserAgentSpecificMemory'
  | 'performance.memory'
  | 'process.memoryUsage'
  | 'none';

export interface DetectorConfig {
  enableEventListenerTracking?: boolean;
  enableTimerTracking?: boolean;
  enableDOMTracking?: boolean;
  enableReduxTracking?: boolean;
  enableReactTracking?: boolean;
  enablePerformanceObserver?: boolean;
  /**
   * Whether to capture full stack traces for every timer or listener creation.
   * Default is false to prevent the detector itself from consuming substantial heap memory.
   */
  captureStackTrace?: boolean;
  /**
   * Frequency (in milliseconds) of periodic reporting. Default: 30000 (30 seconds).
   */
  reportInterval?: number;
  /**
   * Memory threshold in MB for coarse warnings. Default: 300MB.
   */
  memoryThreshold?: number;
  /**
   * Maximum detached nodes to keep weak references for scanning. Default: 200.
   */
  maxDetachedNodeScan?: number;
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
    api?: MemoryApiKind;
  };
  counts: {
    eventListeners: number;
    timers: number;
    domNodes: number;
    detachedNodes: number;
    retainedComponents?: number;
  };
}

export interface MemoryLeakReport {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  memoryApi: MemoryApiKind;
  isMemoryQuantized: boolean;
  leakSuspects: LeakSuspect[];
  recommendations: string[];
  devToolsGuidance?: string[];
}

export interface ComponentRetainCheck {
  componentName: string;
  unmountedAt: number;
  isRetained: boolean;
  stackTrace?: string;
  details?: Record<string, any>;
}
