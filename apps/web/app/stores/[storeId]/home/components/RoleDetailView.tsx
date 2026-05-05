'use client';

import { useState, useEffect, useMemo } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { renderRoleRule } from '@/lib/role-rule-templates';
import { ROLE_RULE_TYPE_LABELS } from '@/lib/role-rule-constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RoleDetailViewProps {
  roleId: number;
  onRoleRuleClick?: (roleRuleId: number, roleRuleName: string) => void;
}

interface RoleData {
  id: number;
  code: string;
  displayName: string;
  storeId: number;
  familyId: number | null;
  family?: { id: number; name: string } | null;
  assignmentModel: string;
  consecutivePolicy: string;
  taskLength: number;
  crewMembers: Array<{
    crewId: string;
    crewMember: { id: string; name: string };
  }>;
}

interface RoleRule {
  id: number;
  roleId?: number;
  type: string;
  constraintType: string;
  displayName?: string;
  description?: string;
  valueInt?: number;
  targetRoleId?: number;
  TargetRole?: { id: number; code: string; displayName: string } | null;
  Role?: { id: number; code: string; displayName: string };
}

interface StoreRoleRule {
  id: number;
  storeId: number;
  roleRuleId: number;
  isPriority: boolean;
  valueInt: number | null;
  RoleRule: RoleRule;
}

export function RoleDetailView({ roleId, onRoleRuleClick }: RoleDetailViewProps) {
  const [role, setRole] = useState<RoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allCrew, setAllCrew] = useState<Array<{ id: string; name: string }>>([]);
  const [pendingDeletions, setPendingDeletions] = useState<Set<string>>(new Set());
  const [pendingAdditions, setPendingAdditions] = useState<Array<{ id: string; name: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleRules, setRoleRules] = useState<RoleRule[]>([]);
  const [storeRoleRules, setStoreRoleRules] = useState<StoreRoleRule[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Load role data
        const roleRes = await authFetch(`${API_URL}/roles?id=${roleId}`);
        if (!roleRes.ok) throw new Error('Failed to load role data');
        const roleData = await roleRes.json();

        // Load all crew for the store
        if (roleData.storeId) {
          const crewRes = await authFetch(`${API_URL}/crew?storeId=${roleData.storeId}`);
          if (crewRes.ok) {
            const crewData = await crewRes.json();
            if (!cancelled) setAllCrew(crewData);
          }
        }

        // Load role rules for this role
        const roleRulesRes = await authFetch(`${API_URL}/role-rules?roleId=${roleId}`);
        if (roleRulesRes.ok) {
          const roleRulesData = await roleRulesRes.json();
          if (!cancelled) setRoleRules(roleRulesData);
        }

        // Load store role rules for this role
        if (roleData.storeId) {
          const storeRoleRulesRes = await authFetch(`${API_URL}/store-role-rules?storeId=${roleData.storeId}`);
          if (storeRoleRulesRes.ok) {
            const storeRoleRulesData = await storeRoleRulesRes.json();
            // Filter to only include rules for this role
            const filteredStoreRules = storeRoleRulesData.filter((srr: StoreRoleRule) =>
              srr.RoleRule?.Role?.id === roleId || srr.RoleRule?.roleId === roleId
            );
            if (!cancelled) setStoreRoleRules(filteredStoreRules);
          }
        }

        if (!cancelled) setRole(roleData);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [roleId]);

  const handleRemoveCrew = (crewId: string) => {
    // Track pending deletion
    setPendingDeletions(prev => new Set(prev).add(crewId));
    // Remove from pending additions if it was just added
    setPendingAdditions(prev => prev.filter(c => c.id !== crewId));
  };

  const handleAddCrew = (crew: { id: string; name: string }) => {
    // Add to pending additions
    setPendingAdditions(prev => [...prev, crew]);
    // Remove from pending deletions if it was marked for deletion
    setPendingDeletions(prev => {
      const next = new Set(prev);
      next.delete(crew.id);
      return next;
    });
    // Clear search after adding
    setSearchQuery('');
  };

  const saveChanges = async () => {
    if (!role || saving) return;

    // Check if there are any changes to save
    const hasChanges = pendingDeletions.size > 0 || pendingAdditions.length > 0;

    if (!hasChanges) {
      // No changes, just exit edit mode
      setIsEditMode(false);
      return;
    }

    setSaving(true);

    try {
      // Process deletions
      for (const crewId of Array.from(pendingDeletions)) {
        await authFetch(`${API_URL}/roles/${roleId}/crew/${crewId}`, {
          method: 'DELETE',
        });
      }

      // Process additions
      for (const crew of Array.from(pendingAdditions)) {
        await authFetch(`${API_URL}/roles/${roleId}/crew`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ crewId: crew.id }),
        });
      }

      // Reload role data
      const res = await authFetch(`${API_URL}/roles?id=${roleId}`);
      if (res.ok) {
        const data = await res.json();
        setRole(data);
      }

      // Clear pending changes
      setPendingDeletions(new Set());
      setPendingAdditions([]);
      setIsEditMode(false);
    } catch (err) {
      console.error('Failed to save changes:', err);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setPendingDeletions(new Set());
    setPendingAdditions([]);
    setSearchQuery('');
    setIsEditMode(false);
  };

  // Compute effective crew (original - deletions + additions, sorted alphabetically)
  const effectiveCrew = useMemo(() => {
    if (!role) return [];

    // Start with original crew members
    const crew = role.crewMembers
      .filter(c => !pendingDeletions.has(c.crewId))
      .map(c => ({ id: c.crewId, name: c.crewMember.name }));

    // Add pending additions and sort alphabetically by name
    return [...crew, ...pendingAdditions].sort((a, b) => a.name.localeCompare(b.name));
  }, [role, pendingDeletions, pendingAdditions]);

  // Compute available crew (crew not already assigned, filtered by search, sorted alphabetically)
  const availableCrew = useMemo(() => {
    const assignedIds = new Set(effectiveCrew.map(c => c.id));
    let unassigned = allCrew.filter(c => !assignedIds.has(c.id));

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      unassigned = unassigned.filter(c => c.name.toLowerCase().includes(query));
    }

    // Sort alphabetically by name
    return unassigned.sort((a, b) => a.name.localeCompare(b.name));
  }, [allCrew, effectiveCrew, searchQuery]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !role) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            borderRadius: '0.5rem',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            color: 'rgb(220, 38, 38)',
          }}
        >
          {error || 'Role not found'}
        </div>
      </CardContainer>
    );
  }

  return (
    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes iosWiggle {
          0% { transform: rotate(-1deg); }
          25% { transform: rotate(1deg); }
          50% { transform: rotate(-1deg); }
          75% { transform: rotate(1deg); }
          100% { transform: rotate(-1deg); }
        }
        .ios-wiggle {
          animation: iosWiggle 0.3s ease-in-out infinite;
        }
      `}} />
      <div className="flex flex-col gap-6">
        {/* Basic Info Section */}
        <div className="flex flex-col gap-3">
          <h3
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 600,
              color: '#6B6B6B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Basic Info
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Code</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500, letterSpacing: '0.05em' }}>{role.code}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Display Name</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>{role.displayName}</span>
            </div>
            {role.family && (
              <div className="flex justify-between">
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Family</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>{role.family.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Settings Section */}
        <div className="flex flex-col gap-3">
          <h3
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 600,
              color: '#6B6B6B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Settings
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Assignment Model</span>
              <div
                className="ai-glass-border"
                style={aiGlassLightBorderStyle('9999px')}
              >
                <div
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.5),
                    padding: '2px 10px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                  }}
                >
                  {role.assignmentModel}
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Consecutive Policy</span>
              <div
                className="ai-glass-border"
                style={aiGlassLightBorderStyle('9999px')}
              >
                <div
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.5),
                    padding: '2px 10px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: role.consecutivePolicy === 'REQUIRED' ? 'hsl(0, 84%, 60%)' : '#2C2C2C',
                  }}
                >
                  {role.consecutivePolicy}
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Task Length</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>{role.taskLength} min</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Role Rules Section */}
        <div className="flex flex-col gap-3">
          <h3
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 600,
              color: '#6B6B6B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Role Rules ({storeRoleRules.length > 0 ? storeRoleRules.length : roleRules.length})
          </h3>
          {storeRoleRules.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {storeRoleRules.map((srr) => {
                const rule = srr.RoleRule;
                const context = {
                  roleRule: {
                    id: rule.id,
                    type: rule.type,
                    constraintType: rule.constraintType,
                    displayName: rule.displayName || null,
                    description: rule.description || null,
                  },
                  role: rule.Role || { id: roleId, code: '', displayName: role?.displayName || '' },
                  targetRole: rule.TargetRole || null,
                  storeRoleRule: {
                    id: srr.id,
                    isPriority: srr.isPriority,
                    valueInt: srr.valueInt,
                  },
                };

                const parts = renderRoleRule(rule.type, context);

                if (!parts) {
                  // Fallback
                  return (
                    <div key={srr.id} style={{ display: 'inline-block' }}>
                      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), display: 'inline-block' }}>
                        <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: '10px' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '13px',
                              color: '#2C2C2C',
                            }}
                          >
                            {rule.displayName || rule.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Calculate smart padding
                const firstPartIsBubble = parts.length > 0 && parts[0].type === 'bubble';
                const lastPartIsBubble = parts.length > 0 && parts[parts.length - 1].type === 'bubble';
                const paddingLeft = firstPartIsBubble ? '10px' : '18px';
                const paddingRight = lastPartIsBubble ? '10px' : '18px';

                return (
                  <div
                    key={srr.id}
                    style={{ display: 'inline-block', cursor: onRoleRuleClick ? 'pointer' : 'default' }}
                    onClick={() => onRoleRuleClick && onRoleRuleClick(rule.id, ROLE_RULE_TYPE_LABELS[rule.type] || rule.type)}
                  >
                    <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), display: 'inline-block' }}>
                      <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: `10px ${paddingRight} 10px ${paddingLeft}` }}>
                        <div
                          className="flex flex-wrap items-center gap-2"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '13px',
                            color: '#2C2C2C',
                          }}
                        >
                          {parts.map((part, idx) => {
                            if (part.type === 'bubble') {
                              return (
                                <div key={idx} className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                  <div
                                    style={{
                                      ...aiGlassLightContentStyle('9999px', 0.5),
                                      background: 'rgba(245, 245, 245, 0.7)',
                                      padding: '4px 12px',
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      color: '#2C2C2C',
                                    }}
                                  >
                                    {part.content}
                                  </div>
                                </div>
                              );
                            }
                            return <span key={idx}>{part.content}</span>;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : roleRules.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {roleRules.map((rule) => {
                const context = {
                  roleRule: {
                    id: rule.id,
                    type: rule.type,
                    constraintType: rule.constraintType,
                    displayName: rule.displayName || null,
                    description: rule.description || null,
                  },
                  role: rule.Role || { id: roleId, code: '', displayName: role?.displayName || '' },
                  targetRole: rule.TargetRole || null,
                  storeRoleRule: {
                    id: rule.id,
                    isPriority: false,
                    valueInt: rule.valueInt || null,
                  },
                };

                const parts = renderRoleRule(rule.type, context);

                if (!parts) {
                  // Fallback
                  return (
                    <div key={rule.id} style={{ display: 'inline-block' }}>
                      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), display: 'inline-block' }}>
                        <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: '10px' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '13px',
                              color: '#2C2C2C',
                            }}
                          >
                            {rule.displayName || rule.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Calculate smart padding
                const firstPartIsBubble = parts.length > 0 && parts[0].type === 'bubble';
                const lastPartIsBubble = parts.length > 0 && parts[parts.length - 1].type === 'bubble';
                const paddingLeft = firstPartIsBubble ? '10px' : '18px';
                const paddingRight = lastPartIsBubble ? '10px' : '18px';

                return (
                  <div
                    key={rule.id}
                    style={{ display: 'inline-block', cursor: onRoleRuleClick ? 'pointer' : 'default' }}
                    onClick={() => onRoleRuleClick && onRoleRuleClick(rule.id, ROLE_RULE_TYPE_LABELS[rule.type] || rule.type)}
                  >
                    <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), display: 'inline-block' }}>
                      <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: `10px ${paddingRight} 10px ${paddingLeft}` }}>
                        <div
                          className="flex flex-wrap items-center gap-2"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '13px',
                            color: '#2C2C2C',
                          }}
                        >
                          {parts.map((part, idx) => {
                            if (part.type === 'bubble') {
                              return (
                                <div key={idx} className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                  <div
                                    style={{
                                      ...aiGlassLightContentStyle('9999px', 0.5),
                                      background: 'rgba(245, 245, 245, 0.7)',
                                      padding: '4px 12px',
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      color: '#2C2C2C',
                                    }}
                                  >
                                    {part.content}
                                  </div>
                                </div>
                              );
                            }
                            return <span key={idx}>{part.content}</span>;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>No role rules defined</span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Assigned Crew Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 600,
                color: '#6B6B6B',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Assigned Crew ({effectiveCrew.length})
            </h3>
            <div className="flex gap-2">
              {isEditMode && (
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6B6B6B',
                    background: 'none',
                    border: 'none',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  if (isEditMode) {
                    saveChanges();
                  } else {
                    setIsEditMode(true);
                  }
                }}
                disabled={saving}
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: isEditMode ? 'hsl(0, 84%, 60%)' : '#6B6B6B',
                  background: 'none',
                  border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  padding: '4px 8px',
                }}
              >
                {saving ? 'Saving...' : isEditMode ? 'Done' : 'Edit'}
              </button>
            </div>
          </div>
          {effectiveCrew.length > 0 || (isEditMode && availableCrew.length > 0) ? (
            <div className="flex flex-wrap gap-2 items-center">
              {effectiveCrew.map((c) => (
                <div
                  key={c.id}
                  className={isEditMode ? 'ios-wiggle' : ''}
                  style={{
                    position: 'relative' as const,
                  }}
                >
                  {/* iOS-style circular minus button overlay */}
                  {isEditMode && (
                    <button
                      onClick={() => handleRemoveCrew(c.id)}
                      disabled={saving}
                      className="ai-glass-border"
                      style={{
                        ...aiGlassLightBorderStyle('9999px'),
                        position: 'absolute' as const,
                        left: '-8px',
                        top: '-8px',
                        zIndex: 10,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        border: 'none',
                        padding: 0,
                        width: '18px',
                        height: '18px',
                      }}
                    >
                      <div
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.7),
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          fontWeight: 300,
                          color: '#2C2C2C',
                          lineHeight: 1,
                        }}
                      >
                        −
                      </div>
                    </button>
                  )}
                  <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                    <div
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.5),
                        padding: '4px 12px',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#2C2C2C',
                      }}
                    >
                      {c.name}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Crew Dropdown - shown in edit mode */}
              {isEditMode && (
                <Menu as="div" style={{ position: 'relative' }}>
                  <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                    <MenuButton
                      disabled={saving}
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.5),
                        padding: '4px 12px',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'hsl(0, 84%, 60%)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                      Add
                    </MenuButton>
                  </div>
                  <MenuItems
                    anchor="bottom start"
                    portal={false}
                    transition
                    className="w-48 origin-top-left shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                    style={{
                      zIndex: 100,
                      ...aiGlassLightBorderStyle('0.75rem'),
                      marginTop: 8,
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    <div
                      className="py-1"
                      style={{
                        ...aiGlassLightContentStyle('0.75rem', 0.95),
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                      }}
                    >
                      {/* Search input */}
                      <div className="px-4 py-2">
                        <input
                          type="text"
                          placeholder="Search crew..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '4px 8px',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '12px',
                            color: '#2C2C2C',
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                            borderRadius: '4px',
                            outline: 'none',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      {availableCrew.length > 0 ? (
                        availableCrew.map((crew) => (
                          <MenuItem key={crew.id}>
                            <div className="px-4 py-2">
                              <button
                                onClick={() => handleAddCrew(crew)}
                                className="text-left text-sm focus:outline-none w-full"
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  color: '#2C2C2C',
                                  backgroundColor: 'transparent',
                                }}
                                onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                                onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                              >
                                {crew.name}
                              </button>
                            </div>
                          </MenuItem>
                        ))
                      ) : (
                        <div className="px-4 py-2" style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E' }}>
                          {searchQuery ? 'No crew found' : 'All crew assigned'}
                        </div>
                      )}
                    </div>
                  </MenuItems>
                </Menu>
              )}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>No crew assigned</span>
          )}
        </div>
      </div>
    </CardContainer>
  );
}
