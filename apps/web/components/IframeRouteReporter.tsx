'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function IframeRouteReporter() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'LOGBOOK_ROUTE_CHANGE', route: pathname }, '*');
  }, [pathname]);

  return null;
}
