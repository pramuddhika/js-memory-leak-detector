import MemoryLeakDetector from '../src/index';

// Example: How to use the Memory Leak Detector

console.log('🚀 Starting Memory Leak Detector Example');

// Create detector with custom configuration
const detector = new MemoryLeakDetector({
  reportInterval: 5000, // Report every 5 seconds for demo
  onReport: (report) => {
    console.log('📊 Memory Report:');
    console.log(`  Heap Used: ${(report.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Total: ${(report.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Leak Suspects: ${report.leakSuspects.length}`);
    
    if (report.leakSuspects.length > 0) {
      console.log('  🚨 Suspected leaks:');
      report.leakSuspects.forEach(suspect => {
        console.log(`    - ${suspect.type}: ${suspect.description} (${suspect.severity})`);
      });
    }
    
    if (report.recommendations.length > 0) {
      console.log('  💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`    - ${rec}`);
      });
    }
    console.log('---');
  },
  
  onLeak: (suspect) => {
    if (suspect.severity === 'critical') {
      console.error('🚨 CRITICAL LEAK DETECTED:', suspect.description);
    }
  }
});

// Start monitoring
detector.start();

// Simulate some memory leaks for demonstration
console.log('Creating memory leaks for demonstration...');

// 1. Event listener leak
const button = document.createElement('button');
document.body.appendChild(button);

for (let i = 0; i < 30; i++) {
  button.addEventListener('click', () => {
    console.log(`Click handler ${i}`);
  });
}

// 2. Timer leak
const intervals: any[] = [];
for (let i = 0; i < 25; i++) {
  const interval = setInterval(() => {
    // This creates many uncleaned intervals
  }, 1000);
  intervals.push(interval);
}

// 3. DOM reference leak
const elements: HTMLElement[] = [];
for (let i = 0; i < 1000; i++) {
  const div = document.createElement('div');
  div.innerHTML = `<span>Element ${i}</span>`;
  elements.push(div); // Keeping references to detached elements
}

// 4. Simulate a slow interaction to trigger the performance observer path
const slowTask = () => {
  const start = performance.now();
  while (performance.now() - start < 250) {
    // Keep the main thread busy briefly to emulate a long task
  }
};

slowTask();

console.log('✅ Memory leaks created. Watch for reports...');

// Clean up after 30 seconds for demo
setTimeout(() => {
  console.log('🧹 Cleaning up...');
  
  // Clean some leaks
  intervals.forEach(id => clearInterval(id));
  elements.length = 0; // Clear array
  
  // Stop detector
  detector.cleanup();
  console.log('✅ Demo completed');
}, 30000);
