import { LeakSuspect } from './types';

export class EventListenerTracker {
  private listeners: Map<EventTarget, Map<string, Set<EventListener>>> = new Map();
  private originalAddEventListener: typeof EventTarget.prototype.addEventListener;
  private originalRemoveEventListener: typeof EventTarget.prototype.removeEventListener;

  constructor() {
    this.originalAddEventListener = EventTarget.prototype.addEventListener;
    this.originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    this.patchEventListeners();
  }

  private patchEventListeners(): void {
    const self = this;

    EventTarget.prototype.addEventListener = function(
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions
    ) {
      // Track the listener
      if (!self.listeners.has(this)) {
        self.listeners.set(this, new Map());
      }
      
      const targetListeners = self.listeners.get(this)!;
      if (!targetListeners.has(type)) {
        targetListeners.set(type, new Set());
      }
      
      targetListeners.get(type)!.add(listener);

      // Call original method
      return self.originalAddEventListener.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function(
      type: string,
      listener: EventListener,
      options?: boolean | EventListenerOptions
    ) {
      // Remove from tracking
      const targetListeners = self.listeners.get(this);
      if (targetListeners && targetListeners.has(type)) {
        targetListeners.get(type)!.delete(listener);
        
        if (targetListeners.get(type)!.size === 0) {
          targetListeners.delete(type);
        }
        
        if (targetListeners.size === 0) {
          self.listeners.delete(this);
        }
      }

      // Call original method
      return self.originalRemoveEventListener.call(this, type, listener, options);
    };
  }

  getActiveListeners(): number {
    let count = 0;
    for (const [target, listeners] of this.listeners) {
      for (const [type, listenerSet] of listeners) {
        count += listenerSet.size;
      }
    }
    return count;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const threshold = 50; // Arbitrary threshold

    for (const [target, listeners] of this.listeners) {
      let totalListeners = 0;
      for (const [type, listenerSet] of listeners) {
        totalListeners += listenerSet.size;
      }

      if (totalListeners > threshold) {
        suspects.push({
          type: 'event-listener',
          severity: totalListeners > 100 ? 'critical' : 'high',
          description: `${totalListeners} event listeners attached to ${target.constructor.name}`,
          count: totalListeners
        });
      }
    }

    return suspects;
  }

  cleanup(): void {
    EventTarget.prototype.addEventListener = this.originalAddEventListener;
    EventTarget.prototype.removeEventListener = this.originalRemoveEventListener;
    this.listeners.clear();
  }
}
