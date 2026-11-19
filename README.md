# JS Memory Leak Detector

> **A lightweight development-time diagnostic & hint toolkit for JavaScript, TypeScript, and React applications.**  
> *Identify leaks, stale closures, and retained DOM/component trees early before shipping to production.*

<div align="center">

[![Documentation](https://img.shields.io/badge/Documentation-Visit%20Official%20Docs-007acc?style=for-the-badge&logo=googledocs&logoColor=white)](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)
[![Config Builder](https://img.shields.io/badge/Config%20Builder-Interactive%20Tool-2ea44f?style=for-the-badge&logo=codewars&logoColor=white)](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/#/config-builder)
[![npm version](https://img.shields.io/npm/v/js-memory-leak-detector?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/js-memory-leak-detector)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

---

## 🌐 Official Web Documentation & Interactive Portal

> 📢 **Complete documentation, in-depth architectural guides, and interactive tools are available on our official website:**  
> 👉 **[Visit the Official Documentation Portal →](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)**

All comprehensive guides, API references, framework integrations, and diagnostic workflows are hosted in the web documentation:

| Resource | Direct Link | Description |
| :--- | :--- | :--- |
| 📖 **Complete Documentation** | **[Documentation Hub](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)** | Full documentation covering all features, concepts, and diagnostics. |
| ⚡ **Interactive Config Builder** | **[Open Config Builder](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/#/config-builder)** | Visually generate, test, and copy ready-to-use configuration code. |
| ⚛️ **React Canary & Patterns** | **[React Integration Guide](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)** | Retained component trees, stale closures, and `AbortController` teardown. |
| 🔬 **Chrome DevTools Guide** | **[DevTools Profiling Guide](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)** | 3-snapshot heap profiling workflow, detached DOM nodes, and CI assertions. |

---

## ⚡ Quick Start

### 1. Installation

```bash
npm install js-memory-leak-detector
```

### 2. Basic Setup

```typescript
import MemoryLeakDetector from 'js-memory-leak-detector';

const detector = new MemoryLeakDetector({
  reportInterval: 30000, // 30 seconds
  onLeak: (suspect) => {
    console.warn(`[Leak Hint] ${suspect.type}: ${suspect.description}`);
    if (suspect.devToolsHint) {
      console.info(`  💡 DevTools Hint: ${suspect.devToolsHint}`);
    }
  },
  onReport: (report) => {
    console.log(`Heap: ${(report.heapUsed / 1024 / 1024).toFixed(2)} MB (${report.memoryApi})`);
  }
});

detector.start();

// Stop when tearing down or in production builds
detector.stop();
```

> 🛠️ **Want an easy setup without writing boilerplate by hand?**  
> Use the **[Interactive Configuration Builder](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/#/config-builder)** to configure your thresholds and copy customized code in one click!

---

## 🚀 Key Capabilities

- **Component Canary Tracking (React)**: Pinpoints unmounted React components whose Fiber nodes, hooks, or closures remain retained in memory after unmount using `WeakRef` & `FinalizationRegistry`.
- **Zero Self-Retention Guarantee**: Built with weak references throughout all trackers (`WeakRef`, `WeakMap`, `FinalizationRegistry`) so the detector never prevents garbage collection or causes leaks itself.
- **Detached DOM Element Detection**: Tracks detached DOM elements and unmounted subtrees held in memory by forgotten references or global listeners.
- **Event Listeners & Timers**: Tracks active listeners on `window`, `document`, and DOM nodes (with native support for `{ once: true }` and `AbortSignal`), and auto-purges completed timeouts.
- **Redux & Store Subscriptions**: Monitors active subscriptions and flags high-frequency selector re-computations.
- **Actionable Chrome DevTools Guidance**: Every emitted warning includes actionable hints for inspecting heap snapshots in Chrome DevTools.

---

## ⚙️ Configuration Reference

Use the **[Interactive Config Builder](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/#/config-builder)** to generate your config visually.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enableEventListenerTracking` | `boolean` | `true` | Monitors event listeners on DOM nodes, `window`, and `document`. |
| `enableTimerTracking` | `boolean` | `true` | Tracks intervals and timeouts (auto-purging executed timeouts). |
| `enableDOMTracking` | `boolean` | `true` | Monitors detached DOM nodes via `WeakRef` and `FinalizationRegistry`. |
| `enableReduxTracking` | `boolean` | `true` | Tracks store subscriptions and selector re-computations. |
| `enableReactTracking` | `boolean` | `true` | Enables canary tracking for unmounted React component tree retention. |
| `captureStackTrace` | `boolean` | `false` | Captures stack traces on allocation (disabled by default for low overhead). |
| `reportInterval` | `number` | `30000` | Periodic reporting interval in milliseconds. |
| `memoryThreshold` | `number` | `300` | Alert threshold in MB for sustained memory expansion. |
| `onLeak` | `(suspect: LeakSuspect) => void` | `noop` | Callback triggered when a leak suspect is identified. |
| `onReport` | `(report: MemoryLeakReport) => void` | `noop` | Periodic full memory report callback. |

*For complete API signatures and advanced settings, see the **[Official Documentation](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)**.*

---

## ⚛️ React Integration

```tsx
import React from 'react';
import MemoryLeakDetector from 'js-memory-leak-detector';

const detector = new MemoryLeakDetector();
detector.start();

// Create the canary hook for React components
export const useRetainedComponentCanary = detector.createReactHook();

export function UserDashboardModal({ userId }: { userId: string }) {
  // Emits a warning if this component unmounts but remains retained in memory after 15s
  useRetainedComponentCanary('UserDashboardModal', { userId });

  return <div>Modal Content</div>;
}
```

*For comprehensive React teardown patterns and `AbortController` recipes, check the **[React Guide on the Documentation Portal](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)**.*

---

## 🔬 Chrome DevTools Heap Profiling

Detectors provide early development warnings; **Chrome DevTools Memory Profiling** is the gold standard for verifying zero leaks before production.

1. **Snapshot 1 (Baseline)**: Open DevTools (`F12`) → **Memory** tab → Take a Heap Snapshot.
2. **Perform Action**: Execute the interaction (e.g. open/close a modal or switch views) **5–10 times**.
3. **Snapshot 2 (Action)**: Take a second heap snapshot.
4. **Teardown & GC**: Return to the initial view and click the **Trash Can icon** (Collect Garbage) in DevTools.
5. **Snapshot 3 (Teardown)**: Take the third heap snapshot.
6. **Compare**: Switch view from **Summary** to **Comparison** and compare **Snapshot 3 against Snapshot 1**. Sort by `# Delta` or `Size Delta` to inspect retained objects.

*Read the step-by-step walkthrough and CI automation guide with Memlab in the **[Official DevTools Documentation](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)**.*

---

## 🔗 Useful Links

- 📖 **Official Documentation**: [https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/)
- ⚙️ **Interactive Config Builder**: [https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/#/config-builder](https://js-memory-leak-detector-docs-pramuddhikas-projects.vercel.app/#/config-builder)
- 📦 **NPM Registry**: [https://www.npmjs.com/package/js-memory-leak-detector](https://www.npmjs.com/package/js-memory-leak-detector)
- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/pramuddhika/js-memory-leak-detector/issues)

---

## 📄 License

MIT © [pramuddhika](https://github.com/pramuddhika)
