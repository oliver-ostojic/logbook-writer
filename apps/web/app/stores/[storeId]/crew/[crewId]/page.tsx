'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { useParams, useRouter } from 'next/navigation';
import { GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { TopNavHeader } from '@/app/stores/[storeId]/home/components';
import { TimingPreferenceCard, CannotBeAssignedAfterCard, RolePreferenceByHourCard, ConsecutiveMinutesCard, RoleDistributionCard, AccountInfoCard } from './components';
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
  const [crew, setCrew] = useState<Crew | null>(null);
  const [preferences, setPreferences] = useState<CrewPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<CrewView>('none');

  // Sync active view with tutorial viewHint (works across page navigations)
  const { isActive: tutorialIsActive, viewHint } = useTutorialStore();
  useEffect(() => {
    if (!viewHint || !tutorialIsActive) return;
    if (viewHint === 'preferences' || viewHint === 'accountInfo') {
      setActiveView(viewHint as CrewView);
    }
  }, [viewHint, tutorialIsActive]);

  const fetchCrewData = async () => {
    setLoading(true);
    try {
      const crewRes = await authFetch(`${API_URL}/crew/${crewId}`);
      if (crewRes.ok) {
        const crewData = await crewRes.json();
        setCrew(crewData);
      }

      const roleRulesRes = await authFetch(`${API_URL}/crew-role-rules?crewId=${crewId}`);
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
                <TopNavHeader storeId={storeId} activeNav="dashboard" />

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

    </main>
  );
}
