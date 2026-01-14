'use client';

import { useState, useEffect, useMemo } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Helper to format preference type names (capitalize only first letter of first word)
function formatPreferenceType(type: string): string {
  const words = type.replace(/_/g, ' ').toLowerCase().split(' ');
  if (words.length === 0) return '';
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

// Helper to format timing value (0-indexed)
function formatTimingValue(value: number): string {
  const labels = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
  return labels[value] || String(value);
}

// Helper to format distribution value (0-indexed)
function formatDistributionValue(value: number): string {
  const labels = ['Balanced', 'More', 'Much More'];
  return labels[value] || String(value);
}

// Decoder for displayName templates
function decodeDisplayName(
  displayName: string,
  ruleType: string,
  valueInt: number | null,
  roleName: string,
  targetRoleName?: string | null
): Array<{ type: 'text' | 'bubble'; content: string }> {
  console.log('decodeDisplayName called with:', { displayName, ruleType, valueInt, roleName, targetRoleName });
  const type = ruleType.toLowerCase();

  // Variable mappings based on rule type
  const getVariableValue = (varNum: number): string => {
    if (type.includes('timing')) {
      if (varNum === 1) {
        // Timing value
        if (valueInt === -1) return 'Earlier';
        if (valueInt === 0) return 'In the middle';
        if (valueInt === 1) return 'Later';
        return String(valueInt || '');
      }
      if (varNum === 2) return roleName;
    }

    if (type.includes('distribution')) {
      if (varNum === 1) return roleName;
      if (varNum === 2) return targetRoleName || '';
    }

    if (type.includes('min_consecutive_minutes')) {
      if (varNum === 1) return String(valueInt || '');
      if (varNum === 2) return roleName;
    }

    // Default fallback
    if (varNum === 1) return roleName;
    if (varNum === 2) return targetRoleName || '';

    return '';
  };

  // Resolve conditional text (word1/word2/...)
  const resolveConditional = (options: string[]): string => {
    if (type.includes('timing')) {
      // For timing: if valueInt is 1 or -1, use first option; if 0, use second option
      if (valueInt === 0) return options[1] || options[0];
      return options[0];
    }
    // Default: use first option
    return options[0];
  };

  const parts: Array<{ type: 'text' | 'bubble'; content: string }> = [];
  let currentText = '';
  let i = 0;

  while (i < displayName.length) {
    // Check for {number} pattern (bubble)
    if (displayName[i] === '{') {
      // Save any accumulated text
      if (currentText.trim()) {
        parts.push({ type: 'text', content: currentText.trim() });
        currentText = '';
      }

      // Find closing }
      const closeIdx = displayName.indexOf('}', i);
      if (closeIdx !== -1) {
        const varNum = parseInt(displayName.substring(i + 1, closeIdx), 10);
        const value = getVariableValue(varNum);
        parts.push({ type: 'bubble', content: value });
        i = closeIdx + 1;
        continue;
      }
    }

    // Check for (word1/word2) pattern (conditional)
    if (displayName[i] === '(') {
      // Save any accumulated text
      if (currentText.trim()) {
        parts.push({ type: 'text', content: currentText.trim() });
        currentText = '';
      }

      // Find closing )
      const closeIdx = displayName.indexOf(')', i);
      if (closeIdx !== -1) {
        const optionsStr = displayName.substring(i + 1, closeIdx);
        const options = optionsStr.split('/');
        const selected = resolveConditional(options);
        currentText += ' ' + selected + ' ';
        i = closeIdx + 1;
        continue;
      }
    }

    // Regular character
    currentText += displayName[i];
    i++;
  }

  // Save any remaining text
  if (currentText.trim()) {
    parts.push({ type: 'text', content: currentText.trim() });
  }

  return parts;
}

interface CrewDetailViewProps {
  crewId: string;
}

interface CrewData {
  id: string;
  name: string;
  storeId: number;
  roles: Array<{
    roleId: number;
    role: {
      id: number;
      code: string;
      displayName: string;
    };
  }>;
  roleRules?: Array<{
    id: number;
    isPriority: boolean;
    valueInt: number | null;
    roleRule: {
      id: number;
      type: string;
      constraintType: string;
      displayName: string | null;
      role: { id: number; code: string; displayName: string };
      targetRole: { id: number; code: string; displayName: string } | null;
    };
  }>;
}

export function CrewDetailView({ crewId }: CrewDetailViewProps) {
  const [crew, setCrew] = useState<CrewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allRoles, setAllRoles] = useState<Array<{ id: number; displayName: string }>>([]);
  const [pendingDeletions, setPendingDeletions] = useState<Set<number>>(new Set());
  const [pendingAdditions, setPendingAdditions] = useState<Array<{ id: number; displayName: string }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Load crew data
        const crewRes = await fetch(`${API_URL}/crew/${crewId}?include=roles,roleRules`);
        if (!crewRes.ok) throw new Error('Failed to load crew data');
        const crewData = await crewRes.json();

        // Load all roles for the store
        if (crewData.storeId) {
          const rolesRes = await fetch(`${API_URL}/stores/${crewData.storeId}/roles`);
          if (rolesRes.ok) {
            const rolesData = await rolesRes.json();
            if (!cancelled) setAllRoles(rolesData);
          }
        }

        if (!cancelled) setCrew(crewData);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [crewId]);

  const handleRemoveRole = (roleId: number) => {
    // Track pending deletion
    setPendingDeletions(prev => new Set(prev).add(roleId));
    // Remove from pending additions if it was just added
    setPendingAdditions(prev => prev.filter(r => r.id !== roleId));
  };

  const handleAddRole = (role: { id: number; displayName: string }) => {
    // Add to pending additions
    setPendingAdditions(prev => [...prev, role]);
    // Remove from pending deletions if it was marked for deletion
    setPendingDeletions(prev => {
      const next = new Set(prev);
      next.delete(role.id);
      return next;
    });
  };

  const saveChanges = async () => {
    if (!crew || saving) return;

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
      for (const roleId of Array.from(pendingDeletions)) {
        await fetch(`${API_URL}/crew/${crewId}/roles/${roleId}`, {
          method: 'DELETE',
        });
      }

      // Process additions
      for (const role of Array.from(pendingAdditions)) {
        await fetch(`${API_URL}/crew/${crewId}/roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleId: role.id }),
        });
      }

      // Reload crew data
      const res = await fetch(`${API_URL}/crew/${crewId}?include=roles,roleRules`);
      if (res.ok) {
        const data = await res.json();
        setCrew(data);
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
    setIsEditMode(false);
  };

  // Compute effective roles (original - deletions + additions)
  const effectiveRoles = useMemo(() => {
    if (!crew) return [];

    // Start with original roles
    const roles = crew.roles
      .filter(r => !pendingDeletions.has(r.roleId))
      .map(r => ({ id: r.roleId, displayName: r.role.displayName }));

    // Add pending additions
    return [...roles, ...pendingAdditions];
  }, [crew, pendingDeletions, pendingAdditions]);

  // Compute available roles (roles not already assigned)
  const availableRoles = useMemo(() => {
    const assignedIds = new Set(effectiveRoles.map(r => r.id));
    return allRoles.filter(r => !assignedIds.has(r.id));
  }, [allRoles, effectiveRoles]);

  // Split role rules into accommodations (HARD) and preferences (SOFT)
  const accommodations = useMemo(() => {
    return crew?.roleRules?.filter(rule => rule.roleRule.constraintType === 'HARD') || [];
  }, [crew?.roleRules]);

  const preferences = useMemo(() => {
    return crew?.roleRules?.filter(rule => rule.roleRule.constraintType === 'SOFT') || [];
  }, [crew?.roleRules]);

  // Helper to render a preference/accommodation item
  const renderRuleItem = (rule: typeof accommodations[0]) => {
    const type = rule.roleRule.type.toLowerCase();
    const isTiming = type.includes('timing');
    const isDistribution = type.includes('distribution');

    // Debug logging
    console.log('Rule:', {
      id: rule.id,
      type: rule.roleRule.type,
      displayName: rule.roleRule.displayName,
      valueInt: rule.valueInt,
      roleName: rule.roleRule.role.displayName,
      targetRoleName: rule.roleRule.targetRole?.displayName,
    });

    // If displayName exists, use the decoder
    if (rule.roleRule.displayName) {
      console.log('Using decoder for displayName:', rule.roleRule.displayName);
      const parts = decodeDisplayName(
        rule.roleRule.displayName,
        rule.roleRule.type,
        rule.valueInt,
        rule.roleRule.role.displayName,
        rule.roleRule.targetRole?.displayName
      );
      console.log('Decoded parts:', parts);

      return (
        <div key={rule.id} style={{ display: 'inline-block' }}>
          {/* Outer title pill wrapper */}
          <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), display: 'inline-block' }}>
            <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: '6px 14px' }}>
              {/* Inner content with flex layout */}
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
    }

    // Fallback to old format if no displayName
    const displayText = formatPreferenceType(rule.roleRule.type);

    return (
      <div
        key={rule.id}
        className="flex flex-wrap items-center gap-2"
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '13px',
          color: '#2C2C2C',
        }}
      >
        {/* For timing: (Value) displayName (Role) */}
        {isTiming && rule.valueInt !== null && (
          <>
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
                {formatTimingValue(rule.valueInt)}
              </div>
            </div>
            <span>{displayText}</span>
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
                {rule.roleRule.role.displayName}
              </div>
            </div>
          </>
        )}

        {/* For distribution: (Role) displayName (TargetRole) */}
        {isDistribution && rule.roleRule.targetRole && rule.valueInt !== null && (
          <>
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
                {rule.roleRule.role.displayName}
              </div>
            </div>
            <span>
              {formatDistributionValue(rule.valueInt)} {displayText}
            </span>
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
                {rule.roleRule.targetRole.displayName}
              </div>
            </div>
          </>
        )}

        {/* Fallback for other types */}
        {!isTiming && !isDistribution && (
          <>
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
                {rule.roleRule.role.displayName}
              </div>
            </div>
            <span>{displayText}</span>
            {rule.roleRule.targetRole && (
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
                  {rule.roleRule.targetRole.displayName}
                </div>
              </div>
            )}
            {rule.valueInt !== null && (
              <span style={{ color: '#6B6B6B' }}>({rule.valueInt})</span>
            )}
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !crew) {
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
          {error || 'Crew not found'}
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
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>ID</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500, letterSpacing: '0.05em' }}>{crew.id}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Name</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>{crew.name}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Store ID</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>{crew.storeId}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Roles Section */}
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
              Assigned Roles ({effectiveRoles.length})
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
          {effectiveRoles.length > 0 || (isEditMode && availableRoles.length > 0) ? (
            <div className="flex flex-wrap gap-2 items-center">
              {effectiveRoles.map((r) => (
                <div
                  key={r.id}
                  className={isEditMode ? 'ios-wiggle' : ''}
                  style={{
                    position: 'relative' as const,
                  }}
                >
                  {/* iOS-style circular minus button overlay */}
                  {isEditMode && (
                    <button
                      onClick={() => handleRemoveRole(r.id)}
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
                      {r.displayName}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Role Dropdown - shown in edit mode */}
              {isEditMode && availableRoles.length > 0 && (
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
                      {availableRoles.map((role) => (
                        <MenuItem key={role.id}>
                          <div className="px-4 py-2">
                            <button
                              onClick={() => handleAddRole(role)}
                              className="text-left text-sm focus:outline-none w-full"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                color: '#2C2C2C',
                                backgroundColor: 'transparent',
                              }}
                              onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                              onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                            >
                              {role.displayName}
                            </button>
                          </div>
                        </MenuItem>
                      ))}
                    </div>
                  </MenuItems>
                </Menu>
              )}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>No roles assigned</span>
          )}
        </div>

        {/* Accommodations Section (Hard Constraints) */}
        {accommodations.length > 0 && (
          <>
            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

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
                Accommodations ({accommodations.length})
              </h3>
              <div className="flex flex-col gap-3">
                {accommodations.map(renderRuleItem)}
              </div>
            </div>
          </>
        )}

        {/* Preferences Section (Soft Constraints) */}
        {preferences.length > 0 && (
          <>
            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

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
                Preferences ({preferences.length})
              </h3>
              <div className="flex flex-col gap-3">
                {preferences.map(renderRuleItem)}
              </div>
            </div>
          </>
        )}

        {/* Show message if no accommodations or preferences */}
        {accommodations.length === 0 && preferences.length === 0 && (
          <>
            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

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
                Preferences (0)
              </h3>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>No preferences or accommodations set</span>
            </div>
          </>
        )}
      </div>
    </CardContainer>
  );
}
