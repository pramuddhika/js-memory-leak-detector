import { LeakSuspect } from './types';

interface TrackedListenerEntry {
  type: string;
  listener: EventListenerOrEventListenerObject;
  wrapped?: EventListenerOrEventListenerObject;
  capture: boolean;
  once: boolean;
  addedAt: number;
  stack?: string;
}

interface TargetHolder {
  ref: WeakRef<EventTarget>;
  name: string;
}

export class EventListenerTracker {
  // Use WeakMap so we never prevent EventTargets from being garbage-collected
  private targetListeners = new WeakMap<EventTarget, Map<string, TrackedListenerEntry[]>>();
  // Track known targets weakly
  private trackedTargets: TargetHolder[] = [];
  private finalizationRegistry?: FinalizationRegistry<TargetHolder>;
  private originalAddEventListener: typeof EventTarget.prototype.addEventListener;
  private originalRemoveEventListener: typeof EventTarget.prototype.removeEventListener;
  private originalWindowAdd?: Function;
  private originalWindowRemove?: Function;
  private captureStackTrace: boolean;

  constructor(options: { captureStackTrace?: boolean } = {}) {
    this.captureStackTrace = options.captureStackTrace ?? false;
    this.originalAddEventListener = EventTarget.prototype.addEventListener;
    this.originalRemoveEventListener = EventTarget.prototype.removeEventListener;

    if (typeof FinalizationRegistry !== 'undefined') {
      this.finalizationRegistry = new FinalizationRegistry<TargetHolder>((holder) => {
        this.trackedTargets = this.trackedTargets.filter(t => t !== holder);
      });
    }

    this.patchEventListeners();
  }

  private registerTarget(target: EventTarget): void {
    if (!this.targetListeners.has(target)) {
      this.targetListeners.set(target, new Map());

      if (typeof WeakRef !== 'undefined') {
        const name = this.getTargetName(target);
        const holder: TargetHolder = {
          ref: new WeakRef(target),
          name
        };
        this.trackedTargets.push(holder);

        if (this.finalizationRegistry) {
          try {
            this.finalizationRegistry.register(target, holder, holder);
          } catch {
            // Ignore if registration fails
          }
        }
      }
    }
  }

  private getTargetName(target: EventTarget): string {
    const ctorName = target.constructor?.name || '';
    if (typeof window !== 'undefined' && (target === window || ctorName === 'Window' || ctorName === 'DOMWindow' || (target as any).window === target)) {
      return 'window';
    }
    if (typeof document !== 'undefined' && (target === document || ctorName === 'HTMLDocument' || ctorName === 'Document')) {
      return 'document';
    }
    if (typeof document !== 'undefined' && target === document.body) {
      return 'document.body';
    }
    if ('tagName' in target) {
      const el = target as Element;
      const id = el.id ? `#${el.id}` : '';
      return `<${el.tagName.toLowerCase()}${id}>`;
    }
    return ctorName || 'EventTarget';
  }

  private createPatchedAddEventListener(originalAdd: Function, originalRemove: Function) {
    const self = this;

    return function(
      this: any,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) {
      if (!listener) {
        return originalAdd.call(this, type, listener as any, options);
      }

      self.registerTarget(this);
      const targetMap = self.targetListeners.get(this);

      const isCapture = typeof options === 'boolean' ? options : !!options?.capture;
      const isOnce = typeof options === 'object' && !!options?.once;
      const signal = typeof options === 'object' ? options?.signal : undefined;

      if (targetMap) {
        if (!targetMap.has(type)) {
          targetMap.set(type, []);
        }
        const entries = targetMap.get(type)!;

        // Check if identical listener is already registered (browser behavior ignores duplicates)
        const exists = entries.some(e => e.listener === listener && e.capture === isCapture);
        if (!exists) {
          const entry: TrackedListenerEntry = {
            type,
            listener,
            capture: isCapture,
            once: isOnce,
            addedAt: Date.now(),
            stack: self.captureStackTrace ? new Error().stack : undefined
          };
          entries.push(entry);

          // Handle { signal: AbortSignal }
          // Use originalAddEventListener so the internal abort handler is NOT self-tracked!
          if (signal && typeof signal.addEventListener === 'function') {
            if (signal.aborted) {
              const removed = self.removeTrackedListener(this, type, listener, isCapture);
              if (removed?.wrapped) {
                originalRemove.call(this, type, removed.wrapped as any, options);
              }
            } else {
              self.originalAddEventListener.call(
                signal,
                'abort',
                () => {
                  const removed = self.removeTrackedListener(this, type, listener, isCapture);
                  if (removed?.wrapped) {
                    originalRemove.call(this, type, removed.wrapped as any, options);
                  }
                },
                { once: true }
              );
            }
          }
        }
      }

      // Handle { once: true } auto-removal from tracking
      if (isOnce) {
        let wrappedListener: EventListener;
        if (typeof listener === 'function') {
          wrappedListener = function(this: any, event: Event) {
            self.removeTrackedListener(this, type, listener, isCapture);
            return (listener as Function).call(this, event);
          };
        } else {
          wrappedListener = {
            handleEvent(event: Event) {
              self.removeTrackedListener(this, type, listener, isCapture);
              return listener.handleEvent(event);
            }
          } as any;
        }

        if (targetMap && targetMap.has(type)) {
          const entry = targetMap.get(type)!.find(e => e.listener === listener && e.capture === isCapture);
          if (entry) {
            entry.wrapped = wrappedListener;
          }
        }

        return originalAdd.call(this, type, wrappedListener, options);
      }

      return originalAdd.call(this, type, listener, options);
    };
  }

  private createPatchedRemoveEventListener(originalRemove: Function) {
    const self = this;

    return function(
      this: any,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions
    ) {
      if (listener) {
        const isCapture = typeof options === 'boolean' ? options : !!options?.capture;
        const removed = self.removeTrackedListener(this, type, listener, isCapture);
        if (removed?.wrapped) {
          return originalRemove.call(this, type, removed.wrapped as any, options);
        }
      }

      return originalRemove.call(this, type, listener as any, options);
    };
  }

  private patchEventListeners(): void {
    EventTarget.prototype.addEventListener = this.createPatchedAddEventListener(
      this.originalAddEventListener,
      this.originalRemoveEventListener
    );
    EventTarget.prototype.removeEventListener = this.createPatchedRemoveEventListener(
      this.originalRemoveEventListener
    );

    // Some environments (e.g. JSDOM, older browser engines) have distinct methods on window
    if (
      typeof window !== 'undefined' &&
      window.addEventListener &&
      window.addEventListener !== EventTarget.prototype.addEventListener
    ) {
      this.originalWindowAdd = window.addEventListener;
      this.originalWindowRemove = window.removeEventListener;
      window.addEventListener = this.createPatchedAddEventListener(this.originalWindowAdd, this.originalWindowRemove) as any;
      window.removeEventListener = this.createPatchedRemoveEventListener(this.originalWindowRemove) as any;
    }
  }

  private removeTrackedListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    capture?: boolean
  ): TrackedListenerEntry | undefined {
    const targetMap = this.targetListeners.get(target);
    if (!targetMap || !targetMap.has(type)) return undefined;

    const entries = targetMap.get(type)!;
    let removedEntry: TrackedListenerEntry | undefined;
    const filtered = entries.filter(e => {
      if (e.listener !== listener) return true;
      if (capture !== undefined && e.capture !== capture) return true;
      removedEntry = e;
      return false;
    });

    if (filtered.length === 0) {
      targetMap.delete(type);
    } else {
      targetMap.set(type, filtered);
    }

    return removedEntry;
  }

  private pruneCollectedTargets(): { target: EventTarget; name: string }[] {
    const live: { target: EventTarget; name: string }[] = [];
    const updatedTracked: TargetHolder[] = [];

    for (const holder of this.trackedTargets) {
      const target = holder.ref.deref();
      if (target) {
        live.push({ target, name: holder.name });
        updatedTracked.push(holder);
      }
    }

    this.trackedTargets = updatedTracked;
    return live;
  }

  getActiveListeners(): number {
    let count = 0;
    const liveTargets = this.pruneCollectedTargets();

    for (const { target } of liveTargets) {
      const targetMap = this.targetListeners.get(target);
      if (targetMap) {
        for (const [, entries] of targetMap) {
          count += entries.length;
        }
      }
    }
    return count;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const liveTargets = this.pruneCollectedTargets();

    for (const { target, name } of liveTargets) {
      const targetMap = this.targetListeners.get(target);
      if (!targetMap) continue;

      let totalForTarget = 0;
      const typeBreakdown: Record<string, number> = {};

      for (const [type, entries] of targetMap) {
        totalForTarget += entries.length;
        typeBreakdown[type] = entries.length;
      }

      // Check global objects (window, document) with lower threshold because components often forget to remove window listeners
      const isGlobal = name === 'window' || name === 'document' || name === 'document.body';
      const threshold = isGlobal ? 25 : 50;

      if (totalForTarget > threshold) {
        const topTypes = Object.entries(typeBreakdown)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t, count]) => `${t} (${count})`)
          .join(', ');

        suspects.push({
          type: 'event-listener',
          severity: totalForTarget > 100 ? 'critical' : totalForTarget > 50 ? 'high' : 'medium',
          description: `${totalForTarget} active event listeners attached to ${name} [${topTypes}]`,
          count: totalForTarget,
          details: { target: name, typeBreakdown },
          devToolsHint: 'Check React useEffect or componentDidMount returns for missing removeEventListener or use AbortController.'
        });
      }
    }

    return suspects;
  }

  cleanup(): void {
    EventTarget.prototype.addEventListener = this.originalAddEventListener;
    EventTarget.prototype.removeEventListener = this.originalRemoveEventListener;

    if (this.originalWindowAdd && typeof window !== 'undefined') {
      window.addEventListener = this.originalWindowAdd as any;
      window.removeEventListener = this.originalWindowRemove as any;
      this.originalWindowAdd = undefined;
      this.originalWindowRemove = undefined;
    }

    this.trackedTargets = [];
  }
}
