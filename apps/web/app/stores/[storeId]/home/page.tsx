'use client';

import { useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';

export default function Home() {
  const params = useParams();
  const storeId = params.storeId as string;

  return (
    <DashboardLayout
      navLinks={[
        { label: 'Home', href: `/stores/${storeId}/home` },
        { label: 'Dashboard', href: `/stores/${storeId}/fairness-dashboard` },
        { label: 'Settings', href: `/stores/${storeId}/settings` },
      ]}
      leftPanel={
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <div className="text-center">
            <h2 className="text-2xl font-medium mb-2" style={{ color: '#DBDADB', fontFamily: 'var(--font-open-sans)' }}>
              Left Panel
            </h2>
            <p className="text-base" style={{ color: '#7C7F82', fontFamily: 'var(--font-open-sans)' }}>
              Content goes here
            </p>
          </div>
        </div>
      }
      rightPanel={
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <div className="text-center">
            <h2 className="text-2xl font-medium mb-2" style={{ color: '#DBDADB', fontFamily: 'var(--font-open-sans)' }}>
              Right Panel
            </h2>
            <p className="text-base" style={{ color: '#7C7F82', fontFamily: 'var(--font-open-sans)' }}>
              Content goes here
            </p>
          </div>
        </div>
      }
      activeNavItem="Home"
    />
  );
}
