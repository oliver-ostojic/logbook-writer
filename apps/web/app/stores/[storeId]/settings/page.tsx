'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon, BuildingStorefrontIcon } from '@heroicons/react/24/solid';
import { GlassPillButton, GlassPillCard, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { StoreRulesSection, DefaultRolesSection, InviteCodesSection } from './components';
import { RoleRuleForm, RoleRuleDetailView, NavStatsCard } from '../home/components';
import { useAuthStore } from '@/lib/authStore';
import { logout } from '@/lib/api/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type SettingsView = 'none' | 'defaultRoles' | 'storeRules' | 'addStoreRule' | 'viewStoreRule' | 'editStoreRule' | 'inviteCodes';

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const { user, canManageUsers, logout: logoutStore } = useAuthStore();

  const [storeRules, setStoreRules] = useState<any[]>([]);
  const [defaultRoles, setDefaultRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<SettingsView>('none');
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [selectedStoreRoleRuleId, setSelectedStoreRoleRuleId] = useState<number | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    logoutStore();
    router.push('/login');
  };

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

  // Find the selected store rule data (for valueInt)
  const selectedStoreRule = storeRules.find(r => r.RoleRule?.id === selectedRuleId);
  const selectedValueInt = selectedStoreRule?.valueInt ?? null;
  const selectedStoreRoleRuleIdFromData = selectedStoreRule?.id ?? null;

  const handleDeleteStoreRule = async () => {
    const storeRoleRuleIdToDelete = selectedStoreRoleRuleIdFromData || selectedStoreRoleRuleId;
    if (!storeRoleRuleIdToDelete) return;

    try {
      const res = await fetch(`${API_URL}/store-role-rules/${storeRoleRuleIdToDelete}`, {
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

      <div className="px-6 lg:px-8 pt-12 lg:pt-16 pb-9">
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
                      padding: '6px',
                    }}
                  >
                    {/* Main nav - 4 equal segments */}
                    <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                      <NavStatsCard
                        label="Home"
                        textOnly
                        isActive={false}
                        onClick={() => router.push(`/stores/${storeId}/home`)}
                        isFirst
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
                        isActive={true}
                        onClick={() => {}}
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

              {/* Settings Content */}
              <div className="flex gap-4">
                {/* Sidebar / Options */}
                <div
                  style={{
                    width: activeView === 'none' ? '100%' : '33%',
                    transition: 'width 0.3s ease',
                  }}
                >
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
                    <div className="flex flex-col gap-3">
                      {/* Settings Header - bento style */}
                      <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                        <GlassPillCard padding="1rem 1.5rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
                          <div className="flex items-center justify-start" style={{ width: '100%' }}>
                            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                              <div
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.6),
                                  padding: '6px 14px',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  color: '#2C2C2C',
                                }}
                              >
                                Settings
                              </div>
                            </div>
                          </div>
                        </GlassPillCard>
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
                    </div>
                    </div>
                  </div>
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

      {/* User dropdown menu */}
      {isUserMenuOpen && (
        <div
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1rem'),
            position: 'fixed',
            top: '100px',
            right: '32px',
            minWidth: '200px',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1rem', 0.95),
              padding: '8px',
            }}
          >
            {user && (
              <div
                style={{
                  padding: '10px 16px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  color: '#6B6B6B',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                  marginBottom: '4px',
                }}
              >
                Signed in as <span style={{ color: '#2C2C2C', fontWeight: 500 }}>{user.username}</span>
              </div>
            )}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  router.push('/admin');
                }}
                className="w-full flex items-center gap-3 transition-all"
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
                <BuildingStorefrontIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
                Back to stores
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 transition-all"
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
              <ArrowRightOnRectangleIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
