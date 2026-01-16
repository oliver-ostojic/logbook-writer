'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DashboardHeader } from '@/components/layouts';
import { CardContainer, CardHeader, GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { TimingPreferenceCard } from './components';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type CrewView = 'none' | 'accountInfo' | 'preferences';

interface Crew {
  id: string;
  name: string;
  storeId: number;
}

export default function CrewPage() {
  const params = useParams();
  const storeId = params.storeId as string;

  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<CrewView>('none');
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);

  const fetchCrews = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/crew?storeId=${storeId}`);
      const data = await res.json();
      setCrews(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch crews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrews();
  }, [storeId]);

  const navLinks = [
    { label: 'Home', href: `/stores/${storeId}/home` },
    { label: 'Crew', href: `/stores/${storeId}/crew` },
    { label: 'Dashboard', href: `/stores/${storeId}/fairness-dashboard` },
    { label: 'Settings', href: `/stores/${storeId}/settings` },
  ];

  return (
    <main className="min-h-screen" style={{ backgroundColor: '#faf9f5' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <DashboardHeader navLinks={navLinks} activeItem="Crew" lightMode={true} />

      <div className="px-6 lg:px-8 pt-20 pb-9">
        <div className="max-w-5xl mx-auto">
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem" borderOpacity={0.15}>
            <div className="flex flex-col gap-6">
              {/* Header */}
              <CardHeader
                title="Crew"
                lightMode={true}
                borderRadius="1.5rem"
                titleStyle={{ color: '#2C2C2C' }}
                borderOpacity={0.15}
              />

              {/* Content */}
              <div
                style={{
                  position: 'relative',
                }}
              >
                {/* Sidebar / Options */}
                <div
                  className="flex flex-col gap-3"
                  style={{
                    opacity: activeView !== 'none' ? 0 : 1,
                    transition: 'opacity 0.6s ease',
                  }}
                >
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
                              Preferences
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '12px',
                                color: '#6B6B6B',
                              }}
                            >
                              X preferences configured
                            </span>
                          </div>
                        </GlassPillButton>
                      </div>
                    </div>
                  </CardContainer>
                </div>

                {/* Detail Panel - slides in to fill width */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: activeView !== 'none' ? '100%' : '0%',
                    transition: 'width 0.6s ease',
                    pointerEvents: activeView !== 'none' ? 'auto' : 'none',
                    overflow: 'hidden',
                    borderRadius: '1rem',
                  }}
                >
                  {activeView === 'accountInfo' && (
                    <CardContainer
                      lightMode={true}
                      borderRadius="1rem"
                      padding="1.5rem"
                      contentStyle={{
                        backdropFilter: 'blur(60px)',
                        WebkitBackdropFilter: 'blur(60px)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          marginBottom: '0.75rem',
                        }}
                      >
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
                      <div style={{ minHeight: '200px' }} />
                    </CardContainer>
                  )}

                  {activeView === 'preferences' && (
                    <CardContainer
                      lightMode={true}
                      borderRadius="1rem"
                      padding="1.5rem"
                      contentStyle={{
                        backdropFilter: 'blur(60px)',
                        WebkitBackdropFilter: 'blur(60px)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          marginBottom: '0.75rem',
                        }}
                      >
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
                      <TimingPreferenceCard />
                    </CardContainer>
                  )}
                </div>
              </div>
            </div>
          </CardContainer>
        </div>
      </div>
    </main>
  );
}
