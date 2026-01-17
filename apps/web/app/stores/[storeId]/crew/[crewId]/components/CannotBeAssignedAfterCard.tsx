'use client';

import { useState, useEffect } from 'react';
import { CardContainer, GlassPillCard, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Role {
  id: number;
  code: string;
  displayName: string;
}

interface CannotBeAssignedAfterRule {
  id: number;                    // CrewRoleRule ID
  crewRoleRuleId: number;        // Same as id
  roleRuleId: number;            // The RoleRule ID
  sourceRoleId: number;          // roleId from RoleRule
  sourceRoleName: string;
  targetRoleId: number;          // targetRoleId from RoleRule
  targetRoleName: string;
}

interface CannotBeAssignedAfterCardProps {
  crewId: string;
  storeId: string;
  onRefresh?: () => void;
}

export function CannotBeAssignedAfterCard({ crewId, storeId, onRefresh }: CannotBeAssignedAfterCardProps) {
  // State management
  const [isEditing, setIsEditing] = useState(false);
  const [rules, setRules] = useState<CannotBeAssignedAfterRule[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add flow state
  const [isAdding, setIsAdding] = useState(false);
  const [newRuleSourceId, setNewRuleSourceId] = useState<number | null>(null);
  const [newRuleTargetId, setNewRuleTargetId] = useState<number | null>(null);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const [sourceCloseTimeout, setSourceCloseTimeout] = useState<NodeJS.Timeout | null>(null);
  const [targetCloseTimeout, setTargetCloseTimeout] = useState<NodeJS.Timeout | null>(null);

  // Data fetching
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch crew with their role rules
      const crewRes = await fetch(`${API_URL}/crew/${crewId}?include=roleRules`);
      if (!crewRes.ok) {
        console.error('Failed to fetch crew data');
        return;
      }
      const crewData = await crewRes.json();

      // Extract crew's accessible roles (from CrewRole)
      const crewRoles = (crewData.roles || []).map((cr: any) => ({
        id: cr.roleId,
        code: cr.role.code,
        displayName: cr.role.displayName,
      }));

      if (crewRoles.length === 0) {
        setRules([]);
        setAvailableRoles([]);
        return;
      }

      // Filter existing CANNOT_BE_ASSIGNED_AFTER rules for this crew
      const cannotBeAssignedAfterRules = (crewData.roleRules || [])
        .filter((crr: any) => crr.roleRule?.type === 'CANNOT_BE_ASSIGNED_AFTER')
        .map((crr: any) => ({
          id: crr.id,
          crewRoleRuleId: crr.id,
          roleRuleId: crr.roleRuleId,
          sourceRoleId: crr.roleRule?.role?.id,
          sourceRoleName: crr.roleRule?.role?.displayName || crr.roleRule?.role?.code || 'Unknown',
          targetRoleId: crr.roleRule?.targetRole?.id,
          targetRoleName: crr.roleRule?.targetRole?.displayName || crr.roleRule?.targetRole?.code || 'Unknown',
        }));

      setRules(cannotBeAssignedAfterRules);
      setAvailableRoles(crewRoles);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (crewId) {
      fetchData();
    }
  }, [crewId]);

  // Start adding new rule
  const handleStartAdding = () => {
    setIsAdding(true);
    setNewRuleSourceId(null);
    setNewRuleTargetId(null);
  };

  // Confirm and save new rule
  const handleConfirmAdd = async () => {
    if (!newRuleSourceId || !newRuleTargetId) return;

    const sourceRoleId = newRuleSourceId;
    const targetRoleId = newRuleTargetId;

    setIsAdding(false);
    setIsEditing(false);
    setNewRuleSourceId(null);
    setNewRuleTargetId(null);
    setShowSourceDropdown(false);
    setShowTargetDropdown(false);

    try {
      // Step 1: Check if RoleRule already exists for this role pair
      const existingRuleRes = await fetch(
        `${API_URL}/role-rules?storeId=${storeId}&type=CANNOT_BE_ASSIGNED_AFTER`
      );

      if (!existingRuleRes.ok) {
        setError('Failed to fetch existing rules');
        return;
      }

      const allStoreRules = await existingRuleRes.json();
      const existingRule = allStoreRules.find(
        (rr: any) => rr.roleId === sourceRoleId && rr.targetRoleId === targetRoleId
      );

      let roleRuleId: number;

      if (existingRule) {
        // Reuse existing RoleRule
        roleRuleId = existingRule.id;

        // Check if crew already assigned to this rule (prevent duplicate CrewRoleRule)
        const alreadyAssigned = rules.some(r => r.roleRuleId === roleRuleId);
        if (alreadyAssigned) {
          setError('You already have this constraint');
          return;
        }
      } else {
        // Step 2: Create new SOFT RoleRule
        const createRuleRes = await fetch(`${API_URL}/role-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleId: sourceRoleId,
            targetRoleId: targetRoleId,
            type: 'CANNOT_BE_ASSIGNED_AFTER',
            constraintType: 'SOFT',
          }),
        });

        if (!createRuleRes.ok) {
          const errorData = await createRuleRes.json();

          // Handle unique constraint violation (P2002)
          if (errorData.error?.includes('P2002') || errorData.error?.includes('unique') || errorData.error?.includes('Duplicate')) {
            // Race condition: rule was created by another request
            // Fetch again to get the ID
            const refetchRes = await fetch(
              `${API_URL}/role-rules?storeId=${storeId}&type=CANNOT_BE_ASSIGNED_AFTER`
            );
            const refetchedRules = await refetchRes.json();
            const newlyCreatedRule = refetchedRules.find(
              (rr: any) => rr.roleId === sourceRoleId && rr.targetRoleId === targetRoleId
            );

            if (newlyCreatedRule) {
              roleRuleId = newlyCreatedRule.id;
            } else {
              setError('Failed to create constraint');
              return;
            }
          } else {
            console.error('Failed to create RoleRule:', errorData);
            setError('Failed to create constraint');
            return;
          }
        } else {
          const newRule = await createRuleRes.json();
          roleRuleId = newRule.id;
        }
      }

      // Step 3: Assign RoleRule to crew via CrewRoleRule
      const assignRes = await fetch(`${API_URL}/crew-role-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewId,
          roleRuleId,
        }),
      });

      if (!assignRes.ok) {
        const errorData = await assignRes.json();
        console.error('Failed to assign rule:', errorData);
        setError('Failed to add constraint');
        return;
      }

      // Refresh data
      await fetchData();
      onRefresh?.();
    } catch (err) {
      console.error('Failed to add rule:', err);
      setError('Failed to add constraint');
    }
  };

  // Remove rule logic
  const handleRemoveRule = async (ruleId: number) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    // Optimistic update
    setRules(prev => prev.filter(r => r.id !== ruleId));

    try {
      const res = await fetch(`${API_URL}/crew-role-rules/${rule.crewRoleRuleId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        // Revert on failure
        await fetchData();
        setError('Failed to remove constraint');
        console.error('Failed to remove rule');
      } else {
        onRefresh?.();
      }
    } catch (err) {
      // Revert on error
      await fetchData();
      setError('Failed to remove constraint');
      console.error('Failed to remove rule:', err);
    }
  };

  // Bubble sentence component
  function RuleBubbleSentence({
    sourceRoleName,
    targetRoleName,
    isEditing,
    onRemove,
  }: {
    sourceRoleName: string;
    targetRoleName: string;
    isEditing: boolean;
    onRemove?: () => void;
  }) {
    return (
      <GlassPillCard
        borderRadius="9999px"
        padding="12px"
        style={{
          width: 'fit-content',
          position: 'relative',
          zIndex: 1,
        }}
        className={isEditing ? 'ios-wiggle' : ''}
      >
        {/* Remove button in corner of card (edit mode only) */}
        {isEditing && onRemove && (
          <div
            className="ai-glass-border"
            style={{
              ...aiGlassLightBorderStyle('50%', '0, 0, 0', 0.12),
              position: 'absolute',
              top: '-6px',
              left: '-6px',
              width: '20px',
              height: '20px',
              zIndex: 10,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              style={{
                ...aiGlassLightContentStyle('50%', 1),
                width: '100%',
                height: '100%',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 700,
                color: '#6B6B6B',
                lineHeight: 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(0.96)';
                e.currentTarget.style.color = '#2C2C2C';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1)';
                e.currentTarget.style.color = '#6B6B6B';
              }}
            >
              −
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          {/* Source Role Bubble */}
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
            <div
              style={{
                ...aiGlassLightContentStyle('9999px', 0.6),
                padding: '4px 10px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#2C2C2C',
              }}
            >
              {sourceRoleName}
            </div>
          </div>

          {/* Text */}
          <span
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '12px',
              color: '#6B6B6B',
            }}
          >
            cannot be assigned after
          </span>

          {/* Target Role Bubble */}
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
            <div
              style={{
                ...aiGlassLightContentStyle('9999px', 0.6),
                padding: '4px 10px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#2C2C2C',
              }}
            >
              {targetRoleName}
            </div>
          </div>
        </div>
      </GlassPillCard>
    );
  }

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
        <div style={{ color: '#9B9B9B', fontSize: '12px', textAlign: 'center' }}>
          Loading...
        </div>
      </CardContainer>
    );
  }

  return (
    <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
      <div className="flex flex-col gap-3">
        {/* Error message */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              backgroundColor: 'hsla(0, 84%, 60%, 0.1)',
              borderRadius: '0.5rem',
              border: '1px solid hsla(0, 84%, 60%, 0.2)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '12px',
                color: 'hsl(0, 84%, 40%)',
              }}
            >
              {error}
            </span>
            <button
              onClick={() => setError(null)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 700,
                color: 'hsl(0, 84%, 40%)',
                lineHeight: 1,
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Title and Edit/Add buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* "Cannot Be Assigned After" title badge */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '220, 38, 38', 0.4), width: 'fit-content' }}>
              <div
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.6),
                  backgroundColor: 'hsla(0, 84%, 60%, 0.08)',
                  padding: '6px 14px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsla(0, 84%, 45%, 0.95)',
                }}
              >
                Cannot Be Assigned After
              </div>
            </div>

            {/* Add button (edit mode only) */}
            {isEditing && (
              <div style={{ position: 'relative' }}>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <button
                    onClick={handleStartAdding}
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.4),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#6B6B6B',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span style={{ color: 'hsl(0, 84%, 60%)', fontSize: '16px', lineHeight: 1 }}>+</span>
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Edit/Done/Save/Cancel buttons */}
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 400,
                color: '#6B6B6B',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#2C2C2C')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6B6B')}
            >
              Edit
            </button>
          ) : isAdding ? (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleConfirmAdd}
                disabled={!newRuleSourceId || !newRuleTargetId}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: newRuleSourceId && newRuleTargetId ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 400,
                  color: newRuleSourceId && newRuleTargetId ? 'hsl(0, 84%, 60%)' : '#9B9B9B',
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewRuleSourceId(null);
                  setNewRuleTargetId(null);
                  setShowSourceDropdown(false);
                  setShowTargetDropdown(false);
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 400,
                  color: '#6B6B6B',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#2C2C2C')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6B6B')}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setIsEditing(false);
                setIsAdding(false);
                setNewRuleSourceId(null);
                setNewRuleTargetId(null);
                setShowSourceDropdown(false);
                setShowTargetDropdown(false);
              }}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 400,
                color: 'hsl(0, 84%, 60%)',
              }}
            >
              Done
            </button>
          )}
        </div>

        {/* New rule being added (appears as own card at top) */}
        {isAdding && (
          <GlassPillCard borderRadius="9999px" padding="12px" style={{ width: 'fit-content', position: 'relative', zIndex: 100 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
              }}
            >
              {/* Source Role Dropdown */}
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  if (sourceCloseTimeout) {
                    clearTimeout(sourceCloseTimeout);
                    setSourceCloseTimeout(null);
                  }
                  setShowSourceDropdown(true);
                }}
                onMouseLeave={() => {
                  const timeout = setTimeout(() => setShowSourceDropdown(false), 200);
                  setSourceCloseTimeout(timeout);
                }}
              >
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '4px 10px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: newRuleSourceId ? '#2C2C2C' : '#9B9B9B',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {newRuleSourceId
                      ? availableRoles.find(r => r.id === newRuleSourceId)?.displayName || 'Select'
                      : 'Select'}
                  </div>
                </div>
                {showSourceDropdown && (
                  <div
                    onMouseEnter={() => {
                      if (sourceCloseTimeout) {
                        clearTimeout(sourceCloseTimeout);
                        setSourceCloseTimeout(null);
                      }
                      setShowSourceDropdown(true);
                    }}
                    onMouseLeave={() => {
                      const timeout = setTimeout(() => setShowSourceDropdown(false), 200);
                      setSourceCloseTimeout(timeout);
                    }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                      padding: '8px',
                      zIndex: 1000,
                      minWidth: '160px',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#9B9B9B',
                        padding: '4px 8px',
                        marginBottom: '4px',
                      }}
                    >
                      Select role
                    </div>
                    {availableRoles.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => {
                          setNewRuleSourceId(role.id);
                          setShowSourceDropdown(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '13px',
                          color: '#2C2C2C',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderRadius: '8px',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {role.displayName || role.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Text */}
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  color: '#6B6B6B',
                }}
              >
                cannot be assigned after
              </span>

              {/* Target Role Dropdown */}
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  if (targetCloseTimeout) {
                    clearTimeout(targetCloseTimeout);
                    setTargetCloseTimeout(null);
                  }
                  setShowTargetDropdown(true);
                }}
                onMouseLeave={() => {
                  const timeout = setTimeout(() => setShowTargetDropdown(false), 200);
                  setTargetCloseTimeout(timeout);
                }}
              >
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '4px 10px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: newRuleTargetId ? '#2C2C2C' : '#9B9B9B',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {newRuleTargetId
                      ? availableRoles.find(r => r.id === newRuleTargetId)?.displayName || 'Select'
                      : 'Select'}
                  </div>
                </div>
                {showTargetDropdown && (
                  <div
                    onMouseEnter={() => {
                      if (targetCloseTimeout) {
                        clearTimeout(targetCloseTimeout);
                        setTargetCloseTimeout(null);
                      }
                      setShowTargetDropdown(true);
                    }}
                    onMouseLeave={() => {
                      const timeout = setTimeout(() => setShowTargetDropdown(false), 200);
                      setTargetCloseTimeout(timeout);
                    }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                      padding: '8px',
                      zIndex: 1000,
                      minWidth: '160px',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#9B9B9B',
                        padding: '4px 8px',
                        marginBottom: '4px',
                      }}
                    >
                      Select role
                    </div>
                    {availableRoles.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => {
                          setNewRuleTargetId(role.id);
                          setShowTargetDropdown(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '13px',
                          color: '#2C2C2C',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderRadius: '8px',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {role.displayName || role.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </GlassPillCard>
        )}

        {/* Existing rules list */}
        {rules.length === 0 ? (
          <GlassPillCard borderRadius="9999px" padding="16px" style={{ width: 'fit-content' }}>
            <div style={{ color: '#9B9B9B', fontSize: '12px', textAlign: 'center', fontFamily: 'var(--font-open-sans)' }}>
              No constraints set
            </div>
          </GlassPillCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rules.map(rule => (
              <RuleBubbleSentence
                key={rule.id}
                sourceRoleName={rule.sourceRoleName}
                targetRoleName={rule.targetRoleName}
                isEditing={isEditing}
                onRemove={() => handleRemoveRule(rule.id)}
              />
            ))}
          </div>
        )}
      </div>
    </CardContainer>
  );
}
