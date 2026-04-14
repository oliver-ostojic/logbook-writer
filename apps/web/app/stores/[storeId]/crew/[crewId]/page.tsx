'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { NavStatsCard } from '@/app/stores/[storeId]/home/components/NavStatsCard';
import { TimingPreferenceCard, CannotBeAssignedAfterCard, RolePreferenceByHourCard, ConsecutiveMinutesCard, RoleDistributionCard, AccountInfoCard } from './components';
import { useAuthStore } from '@/lib/authStore';
import { logout } from '@/lib/api/auth';
import { useTutorialStore } from '@/lib/tutorialStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type CrewView = 'none' | 'accountInfo' | 'preferences';

interface Crew {
  id: string;
  name: string;
  storeId: number;
}

interface CrewPreference {
  id: number;
  crewId: string;
  rolePreferenceId: number;
  crewWeight: number;
  intValue: number | null;
  RolePreference?: {
    id: number;
    preferenceType: string;
    displayName: string;
    baseWeight: number;
  };
}

export default function CrewPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const crewId = params.crewId as string;
  const { user, logout: logoutStore } = useAuthStore();

  const [crew, setCrew] = useState<Crew | null>(null);
  const [preferences, setPreferences] = useState<CrewPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<CrewView>('none');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  // Sync active view with tutorial viewHint (works across page navigations)
  const { isActive: tutorialIsActive, viewHint } = useTutorialStore();
  useEffect(() => {
    if (!viewHint || !tutorialIsActive) return;
    if (viewHint === 'preferences' || viewHint === 'accountInfo') {
      setActiveView(viewHint as CrewView);
    }
  }, [viewHint, tutorialIsActive]);

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

  const fetchCrewData = async () => {
    setLoading(true);
    try {
      const crewRes = await fetch(`${API_URL}/crew/${crewId}`);
      if (crewRes.ok) {
        const crewData = await crewRes.json();
        setCrew(crewData);
      }

      const roleRulesRes = await fetch(`${API_URL}/crew-role-rules?crewId=${crewId}`);
      if (roleRulesRes.ok) {
        const roleRulesData = await roleRulesRes.json();

        const preferenceTypes = new Set([
          'TIMING',
          'CANNOT_BE_ASSIGNED_AFTER',
          'MIN_CONSECUTIVE_MINUTES',
          'MAX_CONSECUTIVE_MINUTES',
          'LIKE_ROLE_FOR_HOUR_X',
          'DISLIKE_ROLE_FOR_HOUR_X',
          'DISTRIBUTION_BETWEEN_ROLE_X'
        ]);

        const preferencesData = (Array.isArray(roleRulesData) ? roleRulesData : []).filter((rr: any) =>
          rr.RoleRule?.type && preferenceTypes.has(rr.RoleRule.type)
        );

        setPreferences(preferencesData);
      }
    } catch (err) {
      console.error('Failed to fetch crew data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (crewId) {
      fetchCrewData();
    }
  }, [crewId]);

  const preferencesCount = preferences.length;

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />

      <div className="px-6 lg:px-8 py-6">
        <div className="mx-auto">
          {/* Outer glass card */}
          <div
            className="ai-glass-border"
            style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.15)}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('1.5rem', 0.4),
                padding: '1.5rem',
              }}
            >
              <div className="flex flex-col gap-6">
                {/* Top nav - same as home/settings */}
                <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                  <div
                    className="ai-glass-border"
                    style={aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)}
                  >
                    <div
                      style={{
                        ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                        padding: '8px',
                      }}
                    >
                      <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                        <NavStatsCard
                          label="Home"
                          textOnly
                          isActive={true}
                          onClick={() => router.push(`/stores/${storeId}/home`)}
                          isFirst
                        />
                        <div ref={userMenuRef} style={{ flex: 1, display: 'flex' }}>
                          <NavStatsCard
                            label="Account"
                            textOnly
                            isActive={isUserMenuOpen}
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            isLast
                          />
                        </div>
                      </nav>
                    </div>
                  </div>
                </div>

                {/* Content - Side panel layout */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '1.5rem',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* List sidebar */}
                  <div
                    style={{
                      width: activeView === 'none' ? '100%' : '30%',
                      transition: 'width 0.3s ease',
                      minWidth: 0,
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      <GlassPillButton
                        onClick={() => setActiveView(activeView === 'accountInfo' ? 'none' : 'accountInfo')}
                        isSelected={activeView === 'accountInfo'}
                        padding="12px 16px"
                        contentStyle={{ justifyContent: 'flex-start' }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '14px',
                              fontWeight: 500,
                              color: '#2C2C2C',
                            }}
                          >
                            Account Info
                          </span>
                        </div>
                      </GlassPillButton>

                      <GlassPillButton
                        onClick={() => setActiveView(activeView === 'preferences' ? 'none' : 'preferences')}
                        isSelected={activeView === 'preferences'}
                        padding="12px 16px"
                        contentStyle={{ justifyContent: 'flex-start' }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '14px',
                              fontWeight: 500,
                              color: '#2C2C2C',
                            }}
                          >
                            Role Preferences
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '12px',
                              color: '#6B6B6B',
                            }}
                          >
                            {preferencesCount} preference{preferencesCount !== 1 ? 's' : ''} configured
                          </span>
                        </div>
                      </GlassPillButton>
                    </div>
                  </div>

                  {/* Detail panel */}
                  {activeView !== 'none' && (
                    <div
                      style={{
                        width: '70%',
                        minWidth: 0,
                      }}
                    >
                      <div
                        className="ai-glass-border"
                        style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.15)}
                      >
                        <div
                          style={{
                            ...aiGlassLightContentStyle('1.5rem', 0.4),
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem',
                          }}
                        >
                          {/* Embedded header bar */}
                          <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                            <div
                              className="ai-glass-border"
                              style={aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)}
                            >
                              <div
                                style={{
                                  ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                                  padding: '1rem',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                                  <div
                                    style={{
                                      ...aiGlassLightContentStyle('9999px', 0.6),
                                      padding: '6px 14px',
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '14px',
                                      fontWeight: 500,
                                      color: '#2C2C2C',
                                    }}
                                  >
                                    {activeView === 'preferences' ? 'Role Preferences' : 'Account Info'}
                                  </div>
                                </div>
                                <GlassPillButton
                                  onClick={() => setActiveView('none')}
                                  isSelected={false}
                                  padding="6px 14px"
                                >
                                  <span
                                    style={{
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      color: '#6B6B6B',
                                    }}
                                  >
                                    Back
                                  </span>
                                </GlassPillButton>
                              </div>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex flex-col gap-4">
                            {activeView === 'accountInfo' && (
                              <AccountInfoCard crewId={crewId} storeId={storeId} />
                            )}
                            {activeView === 'preferences' && (
                              <>
                                <div data-tutorial-id="crew-prefs-distribution-consecutive" className="flex flex-col gap-4">
                                  <RoleDistributionCard crewId={crewId} onRefresh={fetchCrewData} />
                                  <ConsecutiveMinutesCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                                </div>
                                <div data-tutorial-id="crew-prefs-hour-timing" className="flex flex-col gap-4">
                                  <RolePreferenceByHourCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                                  <TimingPreferenceCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                                </div>
                                <div data-tutorial-id="crew-prefs-cannot-be-assigned-after">
                                  <CannotBeAssignedAfterCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
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
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
