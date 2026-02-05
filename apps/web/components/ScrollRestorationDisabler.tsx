'use client';

import { useEffect } from 'react';

/**
 * Disables automatic scroll restoration to prevent Next.js from
 * scrolling to previous positions when navigating between pages.
 */
export function ScrollRestorationDisabler() {
  useEffect(() => {
    // Disable automatic scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  return null;
}
