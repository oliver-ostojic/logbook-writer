'use client';

import { useState, useEffect, useRef } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { useParams, useRouter } from 'next/navigation';
import { GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { StoreRulesSection, DefaultRolesSection, InviteCodesSection } from './components';
import { RoleRuleForm, RoleRuleDetailView, TopNavHeader } from '../home/components';
import { useAuthStore } from '@/lib/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type SettingsView = 'none' | 'defaultRoles' | 'storeRules' | 'addStoreRule' | 'viewStoreRule' | 'editStoreRule' | 'inviteCodes';

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const { canManageUsers } = useAuthStore();

  const [storeRules, setStoreRules] = useState<any[]>([]);
  const [defaultRoles, setDefaultRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<SettingsView>('none');
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [selectedStoreRoleRuleId, setSelectedStoreRoleRuleId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, defaultRolesRes] = await Promise.all([
        authFetch(`${API_URL}/store-role-rules?storeId=${storeId}`).then((r) => r.json()),
        authFetch(`${API_URL}/stores/${storeId}/default-roles`).then((r) => r.json()),
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

  // Find the selected store rule data (for valueInt)
  const selectedStoreRule = storeRules.find(r => r.RoleRule?.id === selectedRuleId);
  const selectedValueInt = selectedStoreRule?.valueInt ?? null;
  const selectedStoreRoleRuleIdFromData = selectedStoreRule?.id ?? null;

  const handleDeleteStoreRule = async () => {
    const storeRoleRuleIdToDelete = selectedStoreRoleRuleIdFromData || selectedStoreRoleRuleId;
    if (!storeRoleRuleIdToDelete) return;

    try {
      const res = await authFetch(`${API_URL}/store-role-rules/${storeRoleRuleIdToDelete}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setActiveView('storeRules');
        setSelectedRuleId(null);
        setSelectedStoreRoleRuleId(null);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to delete store rule:', err);
    }
  };

  const canEdit = canManageUsers(); // CAPTAIN and ADMIN can edit settings

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <style>{`
        @media (min-width: 1200px) {
          .settings-container {
            flex: 0 0 80%;
            max-width: 80%;
          }
        }
      `}</style>

      <div className="px-6 lg:px-8 pt-12 lg:pt-16 pb-9">
        <div className="flex flex-col min-[1200px]:flex-row gap-6 min-[1200px]:justify-center">
          <div className="w-full settings-container">
            <div
              className="ai-glass-border rounded-[1.5rem]"
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
              <TopNavHeader storeId={storeId} activeNav="settings" />

              {/* Settings Content */}
              <div className="flex gap-4">
                {/* Settings rows */}
                <div
                  className="flex flex-col gap-3"
                  style={{
                    width: activeView === 'none' ? '100%' : '30%',
                    transition: 'width 0.3s ease',
                  }}
                >
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
                    if (activeView === 'storeRules' || activeView === 'viewStoreRule' || activeView === 'addStoreRule' || activeView === 'editStoreRule') {
                      setActiveView('none');
                    } else {
                      setActiveView('storeRules');
                    }
                  }}
                  isSelected={activeView === 'storeRules' || activeView === 'viewStoreRule' || activeView === 'addStoreRule' || activeView === 'editStoreRule'}
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

                {/* Invite Codes - only for CAPTAIN/ADMIN */}
                {canEdit && (
                  <GlassPillButton
                    onClick={() => setActiveView(activeView === 'inviteCodes' ? 'none' : 'inviteCodes')}
                    isSelected={activeView === 'inviteCodes'}
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
                        Invite Codes
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '12px',
                          color: '#6B6B6B',
                        }}
                      >
                        Invite team members
                      </span>
                    </div>
                  </GlassPillButton>
                )}
                </div>

                {/* Detail View */}
                {activeView !== 'none' && (
                  <div style={{ width: '70%', transition: 'width 0.3s ease' }}>
                    {activeView === 'defaultRoles' && (
                      <DefaultRolesSection
                        storeId={storeId}
                        defaultRoles={defaultRoles}
                        onRefresh={fetchData}
                        canEdit={canEdit}
                      />
                    )}
                    {activeView === 'storeRules' && (
                      <StoreRulesSection
                        storeRules={storeRules}
                        onAdd={canEdit ? () => setActiveView('addStoreRule') : undefined}
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
                        valueInt={selectedValueInt}
                        storeRoleRuleId={selectedStoreRoleRuleIdFromData ?? undefined}
                        onBack={() => setActiveView('storeRules')}
                        onEdit={canEdit ? () => setActiveView('editStoreRule') : undefined}
                        onDelete={canEdit ? handleDeleteStoreRule : undefined}
                      />
                    )}
                    {activeView === 'editStoreRule' && selectedRuleId && (
                      <RoleRuleForm
                        mode="edit"
                        ruleId={selectedRuleId}
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
                    {activeView === 'inviteCodes' && (
                      <InviteCodesSection storeId={storeId} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
          </div>
        </div>
    </main>
  );
}
