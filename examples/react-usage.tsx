import React, { useEffect, useState } from 'react';
import MemoryLeakDetector, { createReactCanaryHook, DevToolsGuidance } from '../src/index';

// Initialize detector instance
const detector = new MemoryLeakDetector({
  reportInterval: 10000,
  onLeak: (leak) => {
    console.warn(`[Leak Hint] ${leak.type}: ${leak.description}`);
    if (leak.devToolsHint) {
      console.info(`  💡 DevTools: ${leak.devToolsHint}`);
    }
  }
});

detector.start();

// Hook to detect retained unmounted components
const useRetainedComponentCanary = detector.createReactHook();

/**
 * Example 1: Anti-pattern (Causes memory leak)
 * An event listener attached to `window` with a closure capturing component state,
 * but missing cleanup in useEffect return!
 */
export function LeakyProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profileData, setProfileData] = useState<any>(null);

  // Monitor this component instance
  useRetainedComponentCanary('LeakyProfileModal', { userId });

  useEffect(() => {
    // ❌ BAD: Captured in window listener without removeEventListener or AbortController
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
      // Accessing profileData or userId here retains the entire component fiber tree!
      console.log('Active user in closure:', userId, profileData);
    });

    // ❌ Missing cleanup return!
  }, []);

  return <div>User Profile: {userId}</div>;
}

/**
 * Example 2: Best Practice Pattern (Clean, Leak-free)
 * Using AbortController signal in useEffect. One abort() call cleans up
 * all event listeners and fetch requests automatically upon unmount!
 */
export function SafeProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profileData, setProfileData] = useState<any>(null);

  // Monitor this component instance
  useRetainedComponentCanary('SafeProfileModal', { userId });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // ✅ GOOD: Pass signal to addEventListener
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') onClose();
      },
      { signal }
    );

    // ✅ GOOD: Pass signal to fetch
    fetch(`/api/user/${userId}`, { signal })
      .then((res) => res.json())
      .then((data) => setProfileData(data))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      });

    // ✅ GOOD: One line cleans up everything
    return () => controller.abort();
  }, [userId, onClose]);

  return <div>User Profile: {userId}</div>;
}

// Print DevTools 3-snapshot profiling guide in console
console.log('Chrome DevTools Profiling Workflow:');
console.table(DevToolsGuidance.getProfilingWorkflow());
