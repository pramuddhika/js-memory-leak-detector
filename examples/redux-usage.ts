import MemoryLeakDetector from '../src/index';

// Example: Redux Toolkit Memory Leak Detection

console.log('🚀 Redux Memory Leak Detection Example');

// Simulate Redux Toolkit setup
const createMockStore = () => {
  const subscribers: Function[] = [];
  
  return {
    subscribe: (listener: Function) => {
      subscribers.push(listener);
      return () => {
        const index = subscribers.indexOf(listener);
        if (index > -1) {
          subscribers.splice(index, 1);
        }
      };
    },
    dispatch: (action: any) => {
      subscribers.forEach(listener => listener());
    },
    getState: () => ({ user: { name: 'John' }, todos: [] })
  };
};

// Create mock Redux store
const store = createMockStore();

// Make store available for detection
(window as any).__REDUX_STORE__ = store;

// Create detector with Redux tracking enabled
const detector = new MemoryLeakDetector({
  enableReduxTracking: true,
  reportInterval: 3000, // 3 seconds for demo
  onReport: (report) => {
    console.log('📊 Redux Memory Report:');
    console.log(`  Heap Used: ${(report.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Leak Suspects: ${report.leakSuspects.length}`);
    
    if (report.leakSuspects.length > 0) {
      console.log('  🚨 Redux-related leaks:');
      report.leakSuspects.forEach(suspect => {
        if (suspect.type.startsWith('redux')) {
          console.log(`    - ${suspect.type}: ${suspect.description} (${suspect.severity})`);
        }
      });
    }
    
    const reduxRecommendations = report.recommendations.filter(rec => 
      rec.includes('Redux') || rec.includes('selector')
    );
    
    if (reduxRecommendations.length > 0) {
      console.log('  💡 Redux Recommendations:');
      reduxRecommendations.forEach(rec => {
        console.log(`    - ${rec}`);
      });
    }
    console.log('---');
  },
  
  onLeak: (suspect) => {
    if (suspect.type.startsWith('redux') && suspect.severity === 'critical') {
      console.error('🚨 CRITICAL REDUX LEAK:', suspect.description);
    }
  }
});

// Manually patch the store to enable tracking
detector.patchReduxStore(store);

// Start monitoring
detector.start();

console.log('Creating Redux memory leaks for demonstration...');

// Simulate common Redux Toolkit memory leaks
const unsubscribeFunctions: Function[] = [];

// 1. Store subscription leaks (common in useEffect without cleanup)
console.log('Creating Redux subscription leaks...');
for (let i = 0; i < 60; i++) {
  const unsubscribe = store.subscribe(() => {
    // Simulate component that subscribes but never unsubscribes
    console.log(`Leaked subscription ${i} triggered`);
  });
  
  // In a real leak, these unsubscribe functions would be lost
  unsubscribeFunctions.push(unsubscribe);
}

// 2. Simulate excessive selector calls (infinite re-render scenario)
console.log('Simulating excessive selector calls...');
const mockSelector = 'useUserSelector';

// Simulate rapid selector calls (like infinite re-render)
const rapidCalls = setInterval(() => {
  for (let i = 0; i < 100; i++) {
    detector.trackSelectorUsage(mockSelector);
  }
}, 100);

// Clean up after demonstration
setTimeout(() => {
  clearInterval(rapidCalls);
}, 5000);

// 3. Trigger some store updates to activate subscriptions
setInterval(() => {
  store.dispatch({ type: 'UPDATE_STATE', payload: Math.random() });
}, 500);

console.log('✅ Redux memory leaks created. Watch for reports...');

// Clean up after demo
setTimeout(() => {
  console.log('🧹 Cleaning up Redux leaks...');
  
  // Clean up some subscriptions (but not all - simulating partial cleanup)
  const half = Math.floor(unsubscribeFunctions.length / 2);
  for (let i = 0; i < half; i++) {
    unsubscribeFunctions[i]();
  }
  
  console.log(`Cleaned up ${half} subscriptions, ${unsubscribeFunctions.length - half} still leaking`);
  
  // Stop detector
  setTimeout(() => {
    detector.cleanup();
    console.log('✅ Redux leak demo completed');
  }, 5000);
}, 15000);
