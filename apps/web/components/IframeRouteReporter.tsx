'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function IframeRouteReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (window.parent === window) return;
    const qs = searchParams.toString();
    const route = qs ? `${pathname}?${qs}` : pathname;
    window.parent.postMessage({ type: 'LOGBOOK_ROUTE_CHANGE', route }, '*');
  }, [pathname, searchParams]);

  return null;
}
