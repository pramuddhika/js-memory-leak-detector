import { LeakSuspect } from './types';

export interface DevToolsGuidanceSection {
  title: string;
  steps: string[];
  tips: string[];
}

export class DevToolsGuidance {
  /**
   * Returns a comprehensive guide on diagnosing memory leaks using Chrome DevTools Memory panel.
   */
  static getProfilingWorkflow(): DevToolsGuidanceSection[] {
    return [
      {
        title: '1. The Three-Snapshot Heap Profiling Technique',
        steps: [
          'Open Chrome DevTools (F12 or Cmd+Option+I) -> navigate to the "Memory" tab.',
          'Select "Heap snapshot" and click "Take snapshot" (Snapshot 1: Baseline).',
          'Perform the suspected user action (e.g. open modal, route transition, or expand list) 5-10 times.',
          'Take another heap snapshot (Snapshot 2: Action).',
          'Return to the initial state (close modal, navigate back, unmount components).',
          'Click the trash can icon in DevTools ("Collect garbage") to trigger a full GC.',
          'Take a third heap snapshot (Snapshot 3: Teardown).'
        ],
        tips: [
          'In Snapshot 3, change the perspective dropdown from "Summary" to "Comparison" and compare against Snapshot 1.',
          'Sort by "# Delta" or "Size Delta". Any objects with positive delta that were created during the action and not freed are memory leaks!'
        ]
      },
      {
        title: '2. Finding Detached DOM Nodes',
        steps: [
          'Select Snapshot 3 in DevTools Memory panel.',
          'In the "Class filter" box at the top, type: "Detached".',
          'Look for entries like "Detached HTMLDivElement" or "Detached HTMLElement".',
          'Click on a detached node to reveal its "Retainers" tree at the bottom of the pane.'
        ],
        tips: [
          'Yellow highlighted nodes in DevTools mean direct JavaScript references are holding the node alive.',
          'Red highlighted nodes mean the element is part of a detached DOM subtree held by a yellow ancestor node.',
          'Inspect the Retainers tree to see which closure, array, or event listener callback is keeping the node in memory.'
        ]
      },
      {
        title: '3. Diagnosing React Retained Trees & Stale Closures',
        steps: [
          'In the Class filter, search for your React component name or "FiberNode".',
          'Check the number of FiberNode instances in Snapshot 3 compared to Snapshot 1.',
          'Expand a retained FiberNode and examine its "memoizedState" and "memoizedProps".',
          'Look at the Retainers tree to find the retention chain (e.g. window listener -> closure -> component fiber).'
        ],
        tips: [
          'Most React leaks are caused by missing cleanup returns in useEffect.',
          'If an event listener or subscription closure references state or props, it retains the entire component fiber tree indefinitely.'
        ]
      },
      {
        title: '4. Allocation Instrumentation on Timeline',
        steps: [
          'In DevTools Memory tab, choose "Allocation instrumentation on timeline".',
          'Click "Start", interact with your app, and click "Stop".',
          'Blue spikes represent allocations still alive in memory; gray spikes were freed by GC.',
          'Select any blue spikes that persist after unmounting to identify exactly where leaked memory was allocated.'
        ],
        tips: [
          'Useful for catching small continuous leaks that do not trigger coarse threshold alerts.'
        ]
      }
    ];
  }

  /**
   * Recommended React patterns & code review checklist to prevent memory leaks by design.
   */
  static getReactReviewPatterns(): { name: string; problem: string; solution: string; codeExample: string }[] {
    return [
      {
        name: 'AbortController for Event Listeners & Async Tasks',
        problem: 'Adding event listeners in useEffect without cleanup or manually tracking dozens of removeEventListener calls.',
        solution: 'Use an AbortController in useEffect. Pass { signal: controller.signal } to addEventListener and fetch, and call controller.abort() on unmount.',
        codeExample: `useEffect(() => {
  const controller = new AbortController();
  const { signal } = controller;

  window.addEventListener('resize', handleResize, { signal });
  window.addEventListener('scroll', handleScroll, { signal });
  fetchData({ signal });

  return () => controller.abort(); // One cleanup line tears down all listeners & requests!
}, []);`
      },
      {
        name: 'Strict Cleanup Return Contract in useEffect',
        problem: 'Subscribing to external stores, timers, or WebSockets without returning a cleanup function.',
        solution: 'Always return an explicit teardown callback that cancels intervals, unsubscribes, and closes sockets.',
        codeExample: `useEffect(() => {
  const id = setInterval(tick, 1000);
  const unsubscribe = store.subscribe(onStateChange);

  return () => {
    clearInterval(id);
    unsubscribe();
  };
}, []);`
      },
      {
        name: 'Preventing Stale Closures with Refs or useEffectEvent',
        problem: 'Event listeners or timers capturing stale state/props, leading to memory retention of old component closures.',
        solution: 'Store dynamic callbacks in a mutable ref or modern useEffectEvent pattern so long-lived listeners do not capture old scopes.',
        codeExample: `const callbackRef = useRef(callback);
callbackRef.current = callback;

useEffect(() => {
  const handler = (e: MouseEvent) => callbackRef.current(e);
  window.addEventListener('click', handler);
  return () => window.removeEventListener('click', handler);
}, []);`
      },
      {
        name: 'Nullifying Large References on Unmount',
        problem: 'Large data sets, canvas contexts, or heavy third-party SDK instances remaining referenced in unmounted component closures.',
        solution: 'Explicitly nullify large caches or call SDK .destroy()/.dispose() methods in cleanup.',
        codeExample: `useEffect(() => {
  const chart = new ChartInstance(canvasRef.current);
  return () => {
    chart.destroy();
  };
}, []);`
      }
    ];
  }

  /**
   * Formats a concise DevTools action plan for detected leaks.
   */
  static formatDevToolsAdvice(suspects: LeakSuspect[]): string[] {
    const advice: string[] = [];

    if (suspects.length === 0) {
      advice.push('No obvious leaks detected. Note: performance.memory is coarse; profile in Chrome DevTools Memory tab before production.');
      return advice;
    }

    advice.push('--- Chrome DevTools Memory Profiling Hints ---');

    const hasDetached = suspects.some(s => s.type === 'detached-dom');
    const hasListeners = suspects.some(s => s.type === 'event-listener');
    const hasRetainedComponent = suspects.some(s => s.type === 'retained-component');
    const hasTimers = suspects.some(s => s.type === 'timer');

    if (hasDetached) {
      advice.push('• Detached DOM: Open Chrome DevTools -> Memory -> Take Heap Snapshot -> Class filter: "Detached " -> Inspect the Retainers view at bottom.');
    }
    if (hasRetainedComponent) {
      advice.push('• Retained Component: In Heap Snapshot, filter by component name or "FiberNode" -> check Retainers to find which closure/subscription prevents GC.');
    }
    if (hasListeners) {
      advice.push('• Event Listeners: In DevTools Elements panel, select element -> check "Event Listeners" tab in sidebar or search for addEventListener in codebase.');
    }
    if (hasTimers) {
      advice.push('• Timers: Ensure all setInterval and long setTimeout calls in useEffect return their clearInterval/clearTimeout.');
    }

    advice.push('• Recommended: Run "npx memlab find-leaks" for automated end-to-end heap leak assertions in CI.');

    return advice;
  }
}
