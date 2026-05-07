'use client';

import { useState, useEffect } from 'react';
import { HomeContent } from './HomeContent';
import { FairnessContent } from './FairnessContent';
import { SettingsContent } from './SettingsContent';

type Tab = 'home' | 'dashboard' | 'settings';

function tabToUrl(storeId: string, tab: Tab): string {
  if (tab === 'dashboard') return `/stores/${storeId}/fairness-dashboard`;
  if (tab === 'settings') return `/stores/${storeId}/settings`;
  return `/stores/${storeId}/home`;
}

function urlToTab(pathname: string): Tab {
  if (pathname.includes('/fairness-dashboard')) return 'dashboard';
  if (pathname.includes('/settings')) return 'settings';
  return 'home';
}

interface StoreShellProps {
  storeId: string;
  initialTab: Tab;
}

export function StoreShell({ storeId, initialTab }: StoreShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const handleNavChange = (tab: Tab) => {
    history.pushState({ storeShell: true, tab }, '', tabToUrl(storeId, tab));
    window.scrollTo(0, 0);
    setActiveTab(tab);
  };

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.storeShell) {
        setActiveTab(e.state.tab as Tab);
        window.scrollTo(0, 0);
      }
      // Non-storeShell entries are Next.js history entries — let the router handle them.
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (activeTab === 'dashboard') {
    return <FairnessContent storeId={storeId} onNavChange={handleNavChange} />;
  }
  if (activeTab === 'settings') {
    return <SettingsContent storeId={storeId} onNavChange={handleNavChange} />;
  }
  return <HomeContent storeId={storeId} onNavChange={handleNavChange} />;
}
