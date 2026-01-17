'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DashboardHeader } from '@/components/layouts';
import { CardContainer, CardHeader, GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { StoreRulesSection, DefaultRolesSection } from './components';
import { RoleRuleForm, RoleRuleDetailView } from '../home/components';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type SettingsView = 'none' | 'defaultRoles' | 'storeRules' | 'addStoreRule' | 'viewStoreRule';

export default function SettingsPage() {
  const params = useParams();
  const storeId = params.storeId as string;

  const [storeRules, setStoreRules] = useState<any[]>([]);
  const [defaultRoles, setDefaultRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<SettingsView>('none');
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, defaultRolesRes] = await Promise.all([
        fetch(`${API_URL}/store-role-rules?storeId=${storeId}`).then((r) => r.json()),
        fetch(`${API_URL}/stores/${storeId}/default-roles`).then((r) => r.json()),
      ]);
      setStoreRules(Array.isArray(rulesRes) ? rulesRes : []);
      setDefaultRoles(Array.isArray(defaultRolesRes) ? defaultRolesRes : []);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [storeId]);

  const navLinks = [
    { label: 'Home', href: `/stores/${storeId}/home` },
    { label: 'Crew', href: `/stores/${storeId}/crew/1269090` },
    { label: 'Dashboard', href: `/stores/${storeId}/fairness-dashboard` },
    { label: 'Settings', href: `/stores/${storeId}/settings` },
  ];

  return (
    <main className="min-h-screen" style={{ backgroundColor: '#faf9f5' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <DashboardHeader navLinks={navLinks} activeItem="Settings" lightMode={true} />

      <div className="px-6 lg:px-8 pt-20 pb-9">
        <div className="max-w-5xl mx-auto">
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem" borderOpacity={0.15}>
            <div className="flex flex-col gap-6">
              {/* Header */}
              <CardHeader
                title="Store"
                lightMode={true}
                borderRadius="1.5rem"
                titleStyle={{ color: '#2C2C2C' }}
                borderOpacity={0.15}
              />

              {/* Settings Content */}
              <div className="flex gap-4">
                {/* Sidebar / Options */}
                <div
                  style={{
                    width: activeView === 'none' ? '100%' : '33%',
                    transition: 'width 0.3s ease',
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
                          Settings
                        </div>
                      </div>

                      {/* Settings rows */}
                      <div className="flex flex-col gap-3" style={{ marginTop: '2px' }}>
                        <GlassPillButton
                          onClick={() => setActiveView(activeView === 'defaultRoles' ? 'none' : 'defaultRoles')}
                          isSelected={activeView === 'defaultRoles'}
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
                              Default Roles
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '12px',
                                color: '#6B6B6B',
                              }}
                            >
                              {defaultRoles.length} role{defaultRoles.length !== 1 ? 's' : ''} configured
                            </span>
                          </div>
                        </GlassPillButton>

                        <GlassPillButton
                          onClick={() => {
                            if (activeView === 'storeRules' || activeView === 'viewStoreRule' || activeView === 'addStoreRule') {
                              setActiveView('none');
                            } else {
                              setActiveView('storeRules');
                            }
                          }}
                          isSelected={activeView === 'storeRules' || activeView === 'viewStoreRule' || activeView === 'addStoreRule'}
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
                              Store Role Rules
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '12px',
                                color: '#6B6B6B',
                              }}
                            >
                              {storeRules.length} rule{storeRules.length !== 1 ? 's' : ''} active
                            </span>
                          </div>
                        </GlassPillButton>
                      </div>
                    </div>
                  </CardContainer>
                </div>

                {/* Detail View */}
                {activeView !== 'none' && (
                  <div
                    style={{
                      width: '67%',
                      transition: 'width 0.3s ease',
                    }}
                  >
                    {activeView === 'defaultRoles' && (
                      <DefaultRolesSection
                        storeId={storeId}
                        defaultRoles={defaultRoles}
                        onRefresh={fetchData}
                      />
                    )}
                    {activeView === 'storeRules' && (
                      <StoreRulesSection
                        storeId={storeId}
                        storeRules={storeRules}
                        onRefresh={fetchData}
                        onAdd={() => setActiveView('addStoreRule')}
                        onViewRule={(ruleId) => {
                          setSelectedRuleId(ruleId);
                          setActiveView('viewStoreRule');
                        }}
                      />
                    )}
                    {activeView === 'addStoreRule' && (
                      <RoleRuleForm
                        mode="add"
                        storeId={storeId}
                        constraintType="HARD"
                        onSuccess={() => {
                          setActiveView('storeRules');
                          fetchData();
                        }}
                        onCancel={() => {
                          setActiveView('storeRules');
                        }}
                      />
                    )}
                    {activeView === 'viewStoreRule' && selectedRuleId && (
                      <RoleRuleDetailView
                        ruleId={selectedRuleId}
                        constraintType="HARD"
                        onBack={() => setActiveView('storeRules')}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContainer>
        </div>
      </div>
    </main>
  );
}
