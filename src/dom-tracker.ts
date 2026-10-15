import { LeakSuspect } from './types';

interface TrackedDetachedElement {
  ref: WeakRef<Element>;
  tag: string;
  identifier: string;
  detachedAt: number;
}

export class DOMTracker {
  private observer: MutationObserver | null = null;
  // Use WeakRef so the tracker does NOT keep removed DOM nodes alive in memory
  private trackedDetached: TrackedDetachedElement[] = [];
  private finalizationRegistry?: FinalizationRegistry<TrackedDetachedElement>;
  private maxTracked: number;

  constructor(maxTracked = 500) {
    this.maxTracked = maxTracked;
    this.setupFinalization();
    this.setupMutationObserver();
  }

  private setupFinalization(): void {
    if (typeof FinalizationRegistry !== 'undefined') {
      this.finalizationRegistry = new FinalizationRegistry<TrackedDetachedElement>((heldValue) => {
        // Node was collected by the garbage collector - remove from tracking
        this.trackedDetached = this.trackedDetached.filter((item) => item !== heldValue);
      });
    }
  }

  private setupMutationObserver(): void {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) {
      return; // Not available in this environment
    }

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.removedNodes.forEach((node) => {
          this.trackRemovedNode(node);
        });
      }
    });

    try {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } catch {
      // Ignore if document.body cannot be observed in current context
    }
  }

  private trackRemovedNode(node: Node): void {
    if (node.nodeType !== 1 /* Node.ELEMENT_NODE */) {
      return;
    }

    const element = node as Element;

    // Prune stale references if capacity is reached
    if (this.trackedDetached.length >= this.maxTracked) {
      this.pruneCollectedNodes();
      if (this.trackedDetached.length >= this.maxTracked) {
        this.trackedDetached.shift(); // Evict oldest
      }
    }

    const id = element.id ? `#${element.id}` : '';
    const className = element.className && typeof element.className === 'string'
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    const identifier = `<${element.tagName.toLowerCase()}${id}${className}>`;

    if (typeof WeakRef !== 'undefined') {
      const entry: TrackedDetachedElement = {
        ref: new WeakRef(element),
        tag: element.tagName.toLowerCase(),
        identifier,
        detachedAt: Date.now()
      };

      this.trackedDetached.push(entry);

      if (this.finalizationRegistry) {
        try {
          this.finalizationRegistry.register(element, entry, entry);
        } catch {
          // Ignore registration failures if unsupported
        }
      }
    }
  }

  private pruneCollectedNodes(): TrackedDetachedElement[] {
    if (typeof WeakRef === 'undefined') {
      return [];
    }

    const liveDetached: TrackedDetachedElement[] = [];

    for (const item of this.trackedDetached) {
      const el = item.ref.deref();
      if (!el) {
        // Cleaned up by GC!
        continue;
      }
      if (typeof document !== 'undefined' && document.contains(el)) {
        // Reattached to DOM! Not detached.
        continue;
      }
      // Node is still alive in memory AND still detached from DOM!
      liveDetached.push(item);
    }

    this.trackedDetached = liveDetached;
    return liveDetached;
  }

  getDOMNodeCount(): number {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
      return 0;
    }
    return document.querySelectorAll('*').length;
  }

  getDetachedNodeCount(): number {
    return this.pruneCollectedNodes().length;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const currentNodeCount = this.getDOMNodeCount();
    const liveDetached = this.pruneCollectedNodes();
    const detachedCount = liveDetached.length;

    // Check for excessive DOM nodes (DOM bloat)
    if (currentNodeCount > 15000) {
      suspects.push({
        type: 'dom-reference',
        severity: currentNodeCount > 50000 ? 'critical' : 'high',
        description: `${currentNodeCount} active DOM nodes detected (DOM bloat)`,
        count: currentNodeCount,
        devToolsHint: 'Inspect Elements panel -> check deep component nesting or infinite lists without virtualization.'
      });
    }

    // Check for detached DOM nodes still retained in memory
    // Require a grace period (e.g. detached > 5 seconds ago) to avoid false positives during normal transitions
    const now = Date.now();
    const persistentDetached = liveDetached.filter(item => now - item.detachedAt > 5000);

    if (persistentDetached.length > 20) {
      const samples = persistentDetached.slice(0, 3).map(i => i.identifier).join(', ');
      suspects.push({
        type: 'detached-dom',
        severity: persistentDetached.length > 200 ? 'critical' : persistentDetached.length > 50 ? 'high' : 'medium',
        description: `${persistentDetached.length} detached DOM nodes still retained in memory after unmount (e.g., ${samples})`,
        count: persistentDetached.length,
        devToolsHint: 'Chrome DevTools -> Memory -> Take Heap Snapshot -> Class filter: "Detached " -> Check Retainers tree.'
      });
    }

    return suspects;
  }

  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.trackedDetached = [];
  }
}
