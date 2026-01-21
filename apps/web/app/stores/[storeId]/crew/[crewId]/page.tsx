'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DashboardHeader } from '@/components/layouts';
import { CardContainer, CardHeader, GlassPillButton, GlassPillCard, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { TimingPreferenceCard, CannotBeAssignedAfterCard, RolePreferenceByHourCard, ConsecutiveMinutesCard, RoleDistributionCard, AccountInfoCard } from './components';
import { useAuthStore } from '@/lib/authStore';

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
  const storeId = params.storeId as string;
  const crewId = params.crewId as string;
  const { getNavLinks } = useAuthStore();

  const [crew, setCrew] = useState<Crew | null>(null);
  const [preferences, setPreferences] = useState<CrewPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<CrewView>('none');

  const fetchCrewData = async () => {
    setLoading(true);
    try {
      // Fetch crew member details
      const crewRes = await fetch(`${API_URL}/crew/${crewId}`);
      if (crewRes.ok) {
        const crewData = await crewRes.json();
        setCrew(crewData);
      }

      // Fetch crew role rules to count preferences
      const roleRulesRes = await fetch(`${API_URL}/crew-role-rules?crewId=${crewId}`);
      if (roleRulesRes.ok) {
        const roleRulesData = await roleRulesRes.json();

        // Count all role preferences by CrewRoleRule ID
        // Include TIMING, CANNOT_BE_ASSIGNED_AFTER, MIN_CONSECUTIVE_MINUTES, MAX_CONSECUTIVE_MINUTES, LIKE_ROLE_FOR_HOUR_X, DISLIKE_ROLE_FOR_HOUR_X
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

  const navLinks = getNavLinks(storeId);

  // Count preferences for display
  const preferencesCount = preferences.length;

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <DashboardHeader navLinks={navLinks} activeItem="Crew" lightMode={true} />

      <div className="px-6 lg:px-8 pt-24 pb-9">
        <div className="max-w-5xl mx-auto">
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem" borderOpacity={0.15}>
            <div className="flex flex-col gap-6">
              {/* Header */}
              <CardHeader
                title={crew?.name || 'Loading...'}
                lightMode={true}
                borderRadius="1.5rem"
                titleStyle={{ color: '#2C2C2C' }}
                borderOpacity={0.15}
              />

              {/* Content */}
              {activeView === 'none' ? (
                /* Sidebar / Options */
                <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
                  <div className="flex flex-col gap-3">
                    {/* Title bubble */}
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
                        Home
                      </div>
                    </div>

                    {/* Rows */}
                    <div className="flex flex-col gap-3" style={{ marginTop: '2px' }}>
                      <GlassPillButton
                        onClick={() => setActiveView('accountInfo')}
                        isSelected={false}
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
                        onClick={() => setActiveView('preferences')}
                        isSelected={false}
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
                </CardContainer>
              ) : (
                /* Detail Panel */
                <GlassPillCard
                  borderRadius="1.5rem"
                  padding="1rem"
                  style={{ boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12)' }}
                  contentStyle={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.75rem',
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
                    <button
                      onClick={() => setActiveView('none')}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '13px',
                        fontWeight: 400,
                        color: '#6B6B6B',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#2C2C2C')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6B6B')}
                    >
                      Back
                    </button>
                  </div>
                  {activeView === 'accountInfo' && (
                    <AccountInfoCard crewId={crewId} storeId={storeId} />
                  )}
                  {activeView === 'preferences' && (
                    <>
                      <RoleDistributionCard crewId={crewId} onRefresh={fetchCrewData} />
                      <div style={{ marginTop: '1rem' }} />
                      <ConsecutiveMinutesCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                      <div style={{ marginTop: '1rem' }} />
                      <RolePreferenceByHourCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                      <div style={{ marginTop: '1rem' }} />
                      <TimingPreferenceCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                      <div style={{ marginTop: '1rem' }} />
                      <CannotBeAssignedAfterCard crewId={crewId} storeId={storeId} onRefresh={fetchCrewData} />
                    </>
                  )}
                </GlassPillCard>
              )}
            </div>
          </CardContainer>
        </div>
      </div>
    </main>
  );
}
