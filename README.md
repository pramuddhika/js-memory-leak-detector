# JS Memory Leak Detector

> **A lightweight development-time diagnostic & hint toolkit for JavaScript, TypeScript, and React applications.**  
> *Notice: Fine for hints and early developer warnings — not a substitute for Chrome DevTools heap profiling before you ship.*

---

## 🎯 Architecture & Reality: Bottlenecks & Fixes

Modern browser memory behavior and framework architectures introduce nuanced challenges:

| Bottleneck / Limitation | Reality | How We Solve It |
| :--- | :--- | :--- |
| **`performance.memory` is rough & coarse** | Non-standard Chromium-only API; completely absent in Firefox and Safari. In Chrome, memory numbers are quantized and heavily rounded (often in ~100KB–1MB buckets or 20-minute windows) for site-isolation and anti-fingerprinting. Small leaks are invisible here. | Multi-tier detection (`performance.measureUserAgentSpecificMemory`, `performance.memory`, `process.memoryUsage`). Explicit `isMemoryQuantized` flags, and embedded **Chrome DevTools Memory Profiler** workflows. |
| **React Retained Component Trees & Stale Closures** | React's Fiber architecture keeps state, props, and closures tied to component lifecycles. If an outer listener or global store retains a callback from an unmounted component, the *entire component tree* is retained in memory. Aggregate heap numbers cannot identify which component leaked. | Component Canary tracking (`useRetainedComponentCanary`) powered by `WeakRef` and `FinalizationRegistry`. Flags exact unmounted component names still retained in memory after unmount. |
| **The "Cleanup Contract" in React `useEffect`** | A detector cannot fix code for you; React already expects teardown functions returned from `useEffect`. The ultimate defense is code review and robust patterns. | Built-in **React Review & Cleanup Patterns Guide** (e.g. `AbortController` signals for zero-effort listener and fetch teardown, ref patterns for stale closure prevention). |
| **Self-Inflicted Detector Leaks (Fixed)** | Naive memory trackers often retain references in strong `Set`s or `Map`s, causing the very memory leaks they purport to detect. For example, keeping detached DOM nodes in a strong `Set<Node>` prevents garbage collection! | All trackers re-engineered with `WeakRef`, `WeakMap`, and `FinalizationRegistry`. Executed `setTimeout` instances are automatically purged on completion, and `{ once: true }` & `{ signal: AbortSignal }` options are natively supported. |

---

## 🚀 Quick Start

### Installation

```bash
npm install js-memory-leak-detector
```

### Basic Setup

```typescript
import MemoryLeakDetector from 'js-memory-leak-detector';

const detector = new MemoryLeakDetector({
  reportInterval: 30000, // 30 seconds
  onLeak: (suspect) => {
    console.warn(`[Leak Hint] ${suspect.type}: ${suspect.description}`);
    if (suspect.devToolsHint) {
      console.info(`  💡 DevTools: ${suspect.devToolsHint}`);
    }
  },
  onReport: (report) => {
    console.log(`Heap Used: ${(report.heapUsed / 1024 / 1024).toFixed(2)} MB (API: ${report.memoryApi})`);
  }
});

detector.start();

// Stop when done or on application teardown
detector.stop();
```

---

## ⚛️ React Integration & Retained Component Canaries

### Detecting Retained Component Trees (`useRetainedComponentCanary`)

In React, when a component unmounts, its closures and DOM subtrees should be collected by the Garbage Collector. If an uncleaned event listener, interval, or global store holds a reference to a function inside that component, the **entire component tree is retained**.

```tsx
import React, { useEffect, useState } from 'react';
import MemoryLeakDetector from 'js-memory-leak-detector';

const detector = new MemoryLeakDetector();
detector.start();

// Create the canary hook for React
export const useRetainedComponentCanary = detector.createReactHook();

export function UserDashboardModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  // Registers a lightweight canary token with WeakRef & FinalizationRegistry
  // If this component is unmounted but still retained in memory after 15s, a warning is emitted!
  useRetainedComponentCanary('UserDashboardModal', { userId });

  // ...
  return <div>Dashboard Content</div>;
}
```

---

## 🛡️ React Best Practices: Patterns + Review

React expects cleanup functions in `useEffect`. Use these production patterns to guarantee zero memory leaks:

### 1. The `AbortController` Pattern (Cleanest Teardown)

Instead of manually maintaining dozens of `removeEventListener` calls, pass an `AbortSignal`. A single `controller.abort()` call tears down all listeners and network requests on unmount!

```tsx
useEffect(() => {
  const controller = new AbortController();
  const { signal } = controller;

  // Window/Document listeners
  window.addEventListener('resize', handleResize, { signal });
  window.addEventListener('keydown', handleKeydown, { signal });

  // Fetch requests
  fetch(`/api/data`, { signal })
    .then(r => r.json())
    .then(data => setData(data))
    .catch(err => {
      if (err.name !== 'AbortError') console.error(err);
    });

  // One line cleans up EVERYTHING!
  return () => controller.abort();
}, []);
```

### 2. Timers & Subscriptions Cleanup Contract

```tsx
useEffect(() => {
  const timerId = setInterval(tick, 1000);
  const unsubscribe = store.subscribe(onStateChange);

  return () => {
    clearInterval(timerId);
    unsubscribe();
  };
}, []);
```

### 3. Avoiding Stale Closures with `useRef`

When an event listener or timer needs access to dynamic state or callbacks, use a ref instead of re-subscribing or capturing stale closures:

```tsx
const callbackRef = useRef(onSelect);
callbackRef.current = onSelect;

useEffect(() => {
  const handler = (e: MouseEvent) => callbackRef.current?.(e);
  window.addEventListener('click', handler);
  return () => window.removeEventListener('click', handler);
}, []);
```

---

## 🔬 Chrome DevTools Memory Profiling Guide

Runtime detectors are useful for early hints, but **Chrome DevTools Memory Profiling is the gold standard** before shipping to production.

```typescript
import { DevToolsGuidance } from 'js-memory-leak-detector';

// View the step-by-step profiling guide programmatically
console.table(DevToolsGuidance.getProfilingWorkflow());
```

### The Three-Snapshot Heap Profiling Technique

1. **Snapshot 1 (Baseline)**:
   - Open Chrome DevTools (`F12`) → **Memory** tab.
   - Choose **Heap snapshot** → click **Take snapshot**.
2. **Perform Action**:
   - Perform the suspected interaction (e.g. open/close modal, navigate between routes) **5 to 10 times**.
3. **Snapshot 2 (Action)**:
   - Take a second heap snapshot.
4. **Teardown & GC**:
   - Return to the initial page/view.
   - Click the **Trash Can icon** ("Collect garbage") at top left in DevTools to force GC.
5. **Snapshot 3 (Teardown)**:
   - Take the third heap snapshot.
6. **Compare Snapshots**:
   - Switch perspective dropdown from **Summary** to **Comparison**.
   - Compare **Snapshot 3** against **Snapshot 1**.
   - Sort by `# Delta` or `Size Delta`. Any positive delta objects remaining after teardown represent true leaks!

### Finding Detached DOM Nodes

1. In **Snapshot 3**, type `Detached ` in the **Class filter** box.
2. Select any `Detached HTMLDivElement` or `Detached HTMLElement`.
3. In the **Retainers** pane at the bottom:
   - **Yellow nodes**: Directly held by JavaScript variables/closures.
   - **Red nodes**: Detached subtrees retained by an ancestor yellow node.
   - Inspect the retainers tree to identify the exact closure or array retaining the element.

### Automated Leak Detection with Memlab

For continuous integration (CI) and automated regression testing:

```bash
npx memlab find-leaks --scenario=path/to/scenario.js
```

---

## ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enableEventListenerTracking` | `boolean` | `true` | Tracks event listeners on DOM nodes, `window`, and `document` via `WeakMap`. |
| `enableTimerTracking` | `boolean` | `true` | Tracks intervals and timeouts (auto-purging executed timeouts). |
| `enableDOMTracking` | `boolean` | `true` | Monitors detached DOM nodes via `WeakRef` and `FinalizationRegistry`. |
| `enableReduxTracking` | `boolean` | `true` | Monitors store subscriptions and selector re-computation spikes. |
| `enableReactTracking` | `boolean` | `true` | Enables canary tracking for unmounted React component tree retention. |
| `captureStackTrace` | `boolean` | `false` | Captures stack traces on creation. Disabled by default to minimize memory overhead. |
| `reportInterval` | `number` | `30000` | Periodic report interval in milliseconds (30s). |
| `memoryThreshold` | `number` | `300` | Alert threshold in MB for sustained memory expansion. |
| `onLeak` | `(suspect: LeakSuspect) => void` | `noop` | Callback triggered when a leak suspect is identified. |
| `onReport` | `(report: MemoryLeakReport) => void` | `noop` | Periodic full report callback. |

---

## 📊 Report Structure

```typescript
{
  timestamp: 1698765432100,
  heapUsed: 42100000,
  heapTotal: 65200000,
  memoryApi: 'performance.memory', // 'performance.memory' | 'process.memoryUsage' | 'none'
  isMemoryQuantized: true,          // Indicates whether browser quantizes heap values
  leakSuspects: [
    {
      type: 'retained-component',   // 'event-listener' | 'timer' | 'detached-dom' | 'retained-component' | 'redux-subscription'
      severity: 'high',             // 'low' | 'medium' | 'high' | 'critical'
      description: 'React component <UserDashboardModal> unmounted 25s ago but its instance/closures are still retained in memory',
      devToolsHint: 'Open Chrome DevTools -> Memory -> Take Heap Snapshot -> Search for "UserDashboardModal" and inspect Retainers tree.'
    }
  ],
  recommendations: [
    'Retained React Component: An unmounted component tree is still referenced by a stale closure, global listener, or store subscription.',
    'Event Listeners: Ensure removeEventListener is called on unmount or use AbortController signal in useEffect.'
  ],
  devToolsGuidance: [
    '• Retained Component: In Heap Snapshot, filter by component name or "FiberNode" -> check Retainers to find which closure/subscription prevents GC.',
    '• Recommended: Run "npx memlab find-leaks" for automated end-to-end heap leak assertions in CI.'
  ]
}
```

---

## 🧪 Testing & Verification

The suite includes 100% passing tests verifying non-retention of GC-eligible targets:

```bash
npm test
```

```bash
npm run build
```

---

## 📄 License

MIT © pramuddhika
