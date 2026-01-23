'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import ProgressBar from '../../../components/ProgressBar';
import BentoBox from './components/BentoBox';
import { useAuthStore } from '@/lib/authStore';
import { NavStatsCard } from '../../../home/components/NavStatsCard';
import { logout } from '@/lib/api/auth';

export default function PublishPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params?.storeId as string;
  const searchParams = useSearchParams();
  const logbookId = searchParams?.get('logbookId');
  const { user, logout: logoutStore } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isOutsideButton = userMenuRef.current && !userMenuRef.current.contains(target);
      const isOutsideDropdown = userDropdownRef.current && !userDropdownRef.current.contains(target);
      if (isOutsideButton && isOutsideDropdown) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    try {
      await logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    logoutStore();
    router.push('/login');
  };

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <div className="px-6 lg:px-8 pt-12 lg:pt-16 pb-9">
        <style>{`
          @media (min-width: 1200px) {
            .create-wizard-panel {
              flex: 0 0 80%;
              max-width: 80%;
            }
          }
        `}</style>
        <div className="flex flex-col min-[1200px]:flex-row min-[1200px]:justify-center">
          <div
            className="ai-glass-border w-full create-wizard-panel"
            style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
          >
            <div
              className="rounded-[1.5rem]"
              style={{
                ...aiGlassLightContentStyle('1.5rem', 0.6),
                padding: '24px',
              }}
            >
              <div className="flex flex-col gap-6">
                {/* Top nav - bento style header */}
                <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                  <div
                    className="ai-glass-border"
                    style={{
                      ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08),
                    }}
                  >
                    <div
                      style={{
                        ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                        padding: '8px',
                      }}
                    >
                      {/* Main nav - 4 equal segments */}
                      <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                        <NavStatsCard
                          label="Home"
                          textOnly
                          isActive={false}
                          onClick={() => router.push(`/stores/${storeId}/home`)}
                        />
                        <NavStatsCard
                          label="System Health"
                          textOnly
                          isActive={false}
                          onClick={() => router.push(`/stores/${storeId}/fairness-dashboard`)}
                        />
                        <NavStatsCard
                          label="Settings"
                          textOnly
                          isActive={false}
                          onClick={() => router.push(`/stores/${storeId}/settings`)}
                        />
                        <div ref={userMenuRef} style={{ flex: 1, display: 'flex' }}>
                          <NavStatsCard
                            label="Account"
                            textOnly
                            isActive={isUserMenuOpen}
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                          />
                        </div>
                      </nav>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <ProgressBar currentStep={4} />
                <BentoBox logbookId={logbookId} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User dropdown menu - rendered at root level with fixed positioning */}
      {isUserMenuOpen && userMenuRef.current && (
        <div
          ref={(el) => {
            userDropdownRef.current = el;
            // Position dropdown below the user button, matching its width
            if (el && userMenuRef.current) {
              const rect = userMenuRef.current.getBoundingClientRect();
              el.style.top = `${rect.bottom + 16}px`;
              el.style.left = `${rect.left}px`;
              el.style.width = `${rect.width}px`;
            }
          }}
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1rem'),
            position: 'fixed',
            zIndex: 99999,
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1rem', 0.95),
              padding: '8px',
              position: 'relative',
              zIndex: 5,
            }}
          >
            {user && (
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#2C2C2C',
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: '#6B6B6B',
                    marginTop: '2px',
                  }}
                >
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                </div>
              </div>
            )}
            {/* Back to stores - only for ADMIN */}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  router.push('/admin');
                }}
                className="w-full transition-all"
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#2C2C2C',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Back to stores
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full transition-all"
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                color: '#2C2C2C',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
