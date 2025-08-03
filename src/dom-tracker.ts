import { LeakSuspect } from './types';

export class DOMTracker {
  private observer: MutationObserver | null = null;
  private detachedNodes: Set<Node> = new Set();
  private nodeCount = 0;

  constructor() {
    this.setupMutationObserver();
  }

  private setupMutationObserver(): void {
    if (typeof MutationObserver === 'undefined') {
      return; // Not available in this environment
    }

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Track added nodes
        mutation.addedNodes.forEach((node) => {
          this.nodeCount++;
        });

        // Track removed nodes that might become detached
        mutation.removedNodes.forEach((node) => {
          this.checkForDetachedNode(node);
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private checkForDetachedNode(node: Node): void {
    // Check if node is completely detached from DOM
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (!document.contains(element) && element.parentNode === null) {
        this.detachedNodes.add(node);
      }
    }
  }

  getDOMNodeCount(): number {
    return document.querySelectorAll('*').length;
  }

  getDetachedNodeCount(): number {
    return this.detachedNodes.size;
  }

  detectLeaks(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];
    const currentNodeCount = this.getDOMNodeCount();
    const detachedCount = this.getDetachedNodeCount();

    // Check for excessive DOM nodes
    if (currentNodeCount > 10000) {
      suspects.push({
        type: 'dom-reference',
        severity: currentNodeCount > 50000 ? 'critical' : 'high',
        description: `${currentNodeCount} DOM nodes detected (potential DOM bloat)`,
        count: currentNodeCount
      });
    }

    // Check for detached DOM nodes
    if (detachedCount > 100) {
      suspects.push({
        type: 'detached-dom',
        severity: detachedCount > 1000 ? 'critical' : 'medium',
        description: `${detachedCount} detached DOM nodes found in memory`,
        count: detachedCount
      });
    }

    return suspects;
  }

  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.detachedNodes.clear();
  }
}
