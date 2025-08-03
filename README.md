# Memory Leak Detector

🔍 A comprehensive memory leak detector for web applications that helps identify and prevent memory leaks in JavaScript/TypeScript applications.

## Features

- **Event Listener Tracking** - Detects unremoved event listeners
- **Timer Tracking** - Identifies uncleaned timeouts and intervals  
- **DOM Reference Tracking** - Finds detached DOM nodes and excessive DOM growth
- **Memory Growth Analysis** - Monitors heap usage and identifies suspicious growth patterns
- **Real-time Reporting** - Configurable reporting intervals with detailed leak suspects
- **TypeScript Support** - Full TypeScript definitions included
- **Zero Dependencies** - Lightweight with no external dependencies

## Installation

```bash
npm install js-memory-leak-detector
```

## Quick Start

```javascript
import MemoryLeakDetector from 'js-memory-leak-detector';

// Basic usage
const detector = new MemoryLeakDetector({
  onReport: (report) => {
    console.log('Memory Report:', report);
  },
  onLeak: (leak) => {
    console.warn('Potential leak detected:', leak);
  }
});

detector.start();

// Stop when done
detector.stop();
```

## Configuration

```javascript
const detector = new MemoryLeakDetector({
  enableEventListenerTracking: true,    // Track event listeners
  enableTimerTracking: true,             // Track timers
  enableDOMTracking: true,               // Track DOM nodes
  enablePerformanceObserver: true,       // Use Performance Observer API
  reportInterval: 30000,                 // Report every 30 seconds
  memoryThreshold: 300,                  // Alert when memory > 300MB
  onReport: (report) => {
    // Handle memory reports
    console.log('Heap used:', report.heapUsed);
    console.log('Leak suspects:', report.leakSuspects);
    console.log('Recommendations:', report.recommendations);
  },
  onLeak: (suspect) => {
    // Handle individual leak detection
    if (suspect.severity === 'critical') {
      alert('Critical memory leak detected!');
    }
  }
});
```

## Report Structure

```javascript
{
  timestamp: 1642123456789,
  heapUsed: 52428800,        // Bytes
  heapTotal: 67108864,       // Bytes
  external: 1048576,         // Bytes
  arrayBuffers: 524288,      // Bytes
  leakSuspects: [
    {
      type: 'event-listener',  // 'timer' | 'dom-reference' | 'detached-dom' | 'closure'
      severity: 'high',        // 'low' | 'medium' | 'high' | 'critical'
      description: '25 event listeners attached to HTMLDivElement',
      count: 25,
      stackTrace: '...'        // Available for some leak types
    }
  ],
  recommendations: [
    'Remove event listeners when components unmount',
    'Clear intervals and timeouts when no longer needed'
  ]
}
```

## Framework Integration

### React

```javascript
import { useEffect } from 'react';
import MemoryLeakDetector from 'js-memory-leak-detector';

function App() {
  useEffect(() => {
    const detector = new MemoryLeakDetector({
      onLeak: (leak) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Memory leak detected:', leak);
        }
      }
    });
    
    detector.start();
    
    return () => detector.cleanup();
  }, []);

  return <div>Your App</div>;
}
```

### Vue.js

```javascript
import MemoryLeakDetector from 'js-memory-leak-detector';

export default {
  mounted() {
    this.detector = new MemoryLeakDetector({
      onReport: this.handleMemoryReport
    });
    this.detector.start();
  },
  
  beforeDestroy() {
    this.detector.cleanup();
  },
  
  methods: {
    handleMemoryReport(report) {
      // Handle memory reports
    }
  }
}
```

## Common Memory Leak Patterns

### Event Listeners
```javascript
// ❌ BAD - Memory leak
document.addEventListener('click', handleClick);

// ✅ GOOD - Cleanup
const cleanup = () => document.removeEventListener('click', handleClick);
document.addEventListener('click', handleClick);
// Call cleanup when component unmounts
```

### Timers
```javascript
// ❌ BAD - Memory leak  
const interval = setInterval(() => {}, 1000);

// ✅ GOOD - Cleanup
const interval = setInterval(() => {}, 1000);
clearInterval(interval); // Clear when component unmounts
```

### DOM References
```javascript
// ❌ BAD - Memory leak
let elements = [];
elements.push(document.querySelector('.item')); // Keeps DOM ref

// ✅ GOOD - Use WeakMap or clear references
const elementMap = new WeakMap();
```

## API Reference

### MemoryLeakDetector

#### Methods
- `start()` - Start monitoring
- `stop()` - Stop monitoring  
- `generateReport()` - Generate immediate report
- `getSnapshots()` - Get memory snapshots history
- `cleanup()` - Clean up and stop monitoring

#### Events
- `onReport(report)` - Called on each report interval
- `onLeak(suspect)` - Called when leak is detected

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## License

MIT

## Repository

🔗 **GitHub**: [js-memory-leak-detector](https://github.com/pramuddhika/js-memory-leak-detector)

- **Issues**: [Report bugs and request features](https://github.com/pramuddhika/js-memory-leak-detector/issues)
- **Pull Requests**: [Contribute code](https://github.com/pramuddhika/js-memory-leak-detector/pulls)
- **Releases**: [View all releases](https://github.com/pramuddhika/js-memory-leak-detector/releases)

## Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests.
