'use client';

import { useState, useEffect, useRef } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Constants
const SEGMENT_DURATION_MINUTES = 60;
const TOTAL_SEGMENTS = 3;

// Types
interface ConsecutiveMinuteRule {
  minCrewRoleRuleId: number | null;
  maxCrewRoleRuleId: number | null;
  minRoleRuleId: number | null;
  maxRoleRuleId: number | null;
  roleId: number;
  roleName: string;
  minutes: number;
}

interface Role {
  id: number;
  code: string;
  displayName: string;
}

interface NestedPillSegmentSelectorProps {
  selectedSegments: number;
  totalSegments: number;
  isEditing: boolean;
  onChange: (segments: number) => void;
  disabled?: boolean;
}

interface RoleConsecutiveCardProps {
  rule: ConsecutiveMinuteRule;
  isEditing: boolean;
  onRemove: () => void;
  onChange: (segments: number) => void;
}

interface ConsecutiveMinutesCardProps {
  crewId: string;
  storeId: string;
  onRefresh?: () => void;
}

// NestedPillSegmentSelector Component
function NestedPillSegmentSelector({
  selectedSegments,
  totalSegments,
  isEditing,
  onChange,
  disabled = false,
}: NestedPillSegmentSelectorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startSegmentsRef = useRef(selectedSegments);
  const outerPillRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing || disabled) return;

    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startSegmentsRef.current = selectedSegments;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!outerPillRef.current) return;

      const deltaX = e.clientX - startXRef.current;
      const outerPillWidth = outerPillRef.current.offsetWidth;
      const segmentWidth = outerPillWidth / totalSegments;
      const segmentDelta = Math.round(deltaX / segmentWidth);

      const newSegments = Math.max(1, Math.min(totalSegments, startSegmentsRef.current + segmentDelta));

      if (newSegments !== selectedSegments) {
        onChange(newSegments);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, selectedSegments, totalSegments, onChange]);

  // Calculate segment positions
  const segmentLabels = [];
  for (let i = 1; i <= totalSegments; i++) {
    const leftPercent = ((i - 0.5) / totalSegments) * 100;
    segmentLabels.push({ label: i, left: leftPercent });
  }

  // Calculate divider positions
  const dividerPositions = [];
  for (let i = 1; i < totalSegments; i++) {
    dividerPositions.push((i / totalSegments) * 100);
  }

  const innerPillWidth = (selectedSegments / totalSegments) * 100;

  return (
    <div
      ref={outerPillRef}
      className="ai-glass-border"
      style={{
        ...aiGlassLightBorderStyle('9999px'),
        position: 'relative',
        width: '360px',
        height: '64px',
      }}
    >
      <div
        style={{
          ...aiGlassLightContentStyle('9999px', 0.3),
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Segment Dividers */}
        {dividerPositions.map((left, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: 0,
              bottom: 0,
              width: '1px',
              background: 'hsla(0, 0%, 0%, 0.12)',
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Segment Labels */}
        {segmentLabels.map((seg) => (
          <div
            key={seg.label}
            style={{
              position: 'absolute',
              left: `${seg.left}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 500,
              color: '#6B6B6B',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {seg.label}
          </div>
        ))}

        {/* Inner Solid Pill */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            left: '4px',
            top: '4px',
            bottom: '4px',
            width: `calc(${innerPillWidth}% - 8px)`,
            background: 'rgba(255, 255, 255, 1)',
            boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)',
            borderRadius: '9999px',
            transition: isDragging ? 'none' : 'width 0.15s ease, opacity 0.15s ease',
            opacity: isDragging ? 0.8 : 1,
            cursor: isEditing && !disabled ? 'ew-resize' : 'default',
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );
}

// RoleConsecutiveCard Component
function RoleConsecutiveCard({ rule, isEditing, onRemove, onChange }: RoleConsecutiveCardProps) {
  const segments = Math.round(rule.minutes / SEGMENT_DURATION_MINUTES);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}
      className={isEditing ? 'ios-wiggle' : ''}
    >
      {/* Remove Button */}
      {isEditing && (
        <button
          onClick={onRemove}
          style={{
            position: 'absolute',
            left: '-6px',
            top: '-6px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: 'none',
            background: '#6B6B6B',
            color: 'white',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#2C2C2C')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#6B6B6B')}
        >
          −
        </button>
      )}

      {/* Role Name Bubble */}
      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
        <div
          style={{
            ...aiGlassLightContentStyle('9999px', 0.6),
            padding: '8px 16px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            fontWeight: 500,
            color: '#2C2C2C',
          }}
        >
          {rule.roleName}
        </div>
      </div>

      {/* Nested Pill Selector */}
      <NestedPillSegmentSelector
        selectedSegments={segments}
        totalSegments={TOTAL_SEGMENTS}
        isEditing={isEditing}
        onChange={(newSegments) => onChange(newSegments)}
      />
    </div>
  );
}

// Main Component
export function ConsecutiveMinutesCard({ crewId, storeId, onRefresh }: ConsecutiveMinutesCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [rules, setRules] = useState<ConsecutiveMinuteRule[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add flow state
  const [isAdding, setIsAdding] = useState(false);
  const [newRuleRoleId, setNewRuleRoleId] = useState<number | null>(null);
  const [newRuleSegments, setNewRuleSegments] = useState(1);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const roleDropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch crew with roleRules
      const crewRes = await fetch(`${API_URL}/crew/${crewId}?include=roleRules`);
      if (!crewRes.ok) throw new Error('Failed to fetch crew data');
      const crewData = await crewRes.json();

      // Filter consecutive minute rules
      const consecutiveRules = (crewData.roleRules || []).filter(
        (rr: any) =>
          rr.RoleRule?.type === 'MIN_CONSECUTIVE_MINUTES' || rr.RoleRule?.type === 'MAX_CONSECUTIVE_MINUTES'
      );

      // Group by roleId
      const rulesByRole: Record<string, any[]> = {};
      consecutiveRules.forEach((rule: any) => {
        const roleId = rule.RoleRule.roleId;
        if (!rulesByRole[roleId]) rulesByRole[roleId] = [];
        rulesByRole[roleId].push(rule);
      });

      // Build ConsecutiveMinuteRule objects
      const parsedRules: ConsecutiveMinuteRule[] = Object.entries(rulesByRole).map(([roleId, rules]) => {
        const minRule = rules.find((r) => r.RoleRule.type === 'MIN_CONSECUTIVE_MINUTES');
        const maxRule = rules.find((r) => r.RoleRule.type === 'MAX_CONSECUTIVE_MINUTES');

        const minutes = minRule?.valueInt || maxRule?.valueInt || 60;

        // Log warning if MIN and MAX don't match
        if (minRule && maxRule && minRule.valueInt !== maxRule.valueInt) {
          console.warn(
            `MIN (${minRule.valueInt}) and MAX (${maxRule.valueInt}) don't match for role ${roleId}. Using MIN value.`
          );
        }

        return {
          minCrewRoleRuleId: minRule?.id || null,
          maxCrewRoleRuleId: maxRule?.id || null,
          minRoleRuleId: minRule?.roleRuleId || null,
          maxRoleRuleId: maxRule?.roleRuleId || null,
          roleId: Number(roleId),
          roleName: minRule?.RoleRule?.Role?.displayName || maxRule?.RoleRule?.Role?.displayName || 'Unknown',
          minutes,
        };
      });

      setRules(parsedRules);

      // Get available roles (crew roles without consecutive rules)
      const crewRoles = crewData.roles || [];
      const usedRoleIds = new Set(parsedRules.map((r) => r.roleId));
      const available = crewRoles
        .filter((cr: any) => !usedRoleIds.has(cr.roleId))
        .map((cr: any) => ({
          id: cr.roleId,
          code: cr.Role?.code || '',
          displayName: cr.Role?.displayName || '',
        }));

      setAvailableRoles(available);
    } catch (err) {
      console.error('Error fetching consecutive minute rules:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [crewId]);

  // API helpers
  const findOrCreateRoleRule = async (roleId: number, type: string): Promise<number> => {
    // Check if RoleRule exists
    const res = await fetch(`${API_URL}/role-rules?storeId=${storeId}&roleId=${roleId}&type=${type}`);
    if (!res.ok) throw new Error('Failed to fetch role rules');
    const existing = await res.json();

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new RoleRule
    const createRes = await fetch(`${API_URL}/role-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roleId,
        type,
        constraintType: 'SOFT',
        storeId: Number(storeId),
      }),
    });

    if (!createRes.ok) {
      const errorData = await createRes.json();
      // Handle P2002 (unique constraint violation) - rule was created concurrently
      if (errorData.code === 'P2002') {
        // Refetch and return existing
        const retryRes = await fetch(`${API_URL}/role-rules?storeId=${storeId}&roleId=${roleId}&type=${type}`);
        const retryData = await retryRes.json();
        if (retryData.length > 0) return retryData[0].id;
      }
      throw new Error('Failed to create role rule');
    }

    const newRule = await createRes.json();
    return newRule.id;
  };

  const createConsecutiveRule = async (roleId: number, segments: number) => {
    const minutes = segments * SEGMENT_DURATION_MINUTES;

    try {
      // Step 1-2: Find or create MIN and MAX RoleRules
      const minRoleRuleId = await findOrCreateRoleRule(roleId, 'MIN_CONSECUTIVE_MINUTES');
      const maxRoleRuleId = await findOrCreateRoleRule(roleId, 'MAX_CONSECUTIVE_MINUTES');

      // Step 3-4: Create MIN and MAX CrewRoleRules
      const [minRes, maxRes] = await Promise.all([
        fetch(`${API_URL}/crew-role-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crewId,
            roleRuleId: minRoleRuleId,
            valueInt: minutes,
          }),
        }),
        fetch(`${API_URL}/crew-role-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crewId,
            roleRuleId: maxRoleRuleId,
            valueInt: minutes,
          }),
        }),
      ]);

      if (!minRes.ok || !maxRes.ok) throw new Error('Failed to create crew role rules');

      const [minCrewRule, maxCrewRule] = await Promise.all([minRes.json(), maxRes.json()]);

      return { minCrewRule, maxCrewRule };
    } catch (err) {
      console.error('Error creating consecutive rule:', err);
      throw err;
    }
  };

  const updateConsecutiveRule = async (
    minCrewRoleRuleId: number | null,
    maxCrewRoleRuleId: number | null,
    segments: number
  ) => {
    const minutes = segments * SEGMENT_DURATION_MINUTES;

    const updates = [];

    if (minCrewRoleRuleId) {
      updates.push(
        fetch(`${API_URL}/crew-role-rules/${minCrewRoleRuleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInt: minutes }),
        })
      );
    }

    if (maxCrewRoleRuleId) {
      updates.push(
        fetch(`${API_URL}/crew-role-rules/${maxCrewRoleRuleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInt: minutes }),
        })
      );
    }

    await Promise.all(updates);
  };

  const deleteConsecutiveRule = async (minCrewRoleRuleId: number | null, maxCrewRoleRuleId: number | null) => {
    const deletes = [];

    if (minCrewRoleRuleId) {
      deletes.push(
        fetch(`${API_URL}/crew-role-rules/${minCrewRoleRuleId}`, {
          method: 'DELETE',
        })
      );
    }

    if (maxCrewRoleRuleId) {
      deletes.push(
        fetch(`${API_URL}/crew-role-rules/${maxCrewRoleRuleId}`, {
          method: 'DELETE',
        })
      );
    }

    await Promise.all(deletes);
  };

  // Event handlers
  const handleAddClick = () => {
    setIsAdding(true);
    setNewRuleRoleId(null);
    setNewRuleSegments(1);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewRuleRoleId(null);
    setNewRuleSegments(1);
  };

  const handleSaveAdd = async () => {
    if (!newRuleRoleId) return;

    const role = availableRoles.find((r) => r.id === newRuleRoleId);
    if (!role) return;

    try {
      setError(null);
      await createConsecutiveRule(newRuleRoleId, newRuleSegments);

      // Refresh data
      await fetchData();
      setIsAdding(false);
      setNewRuleRoleId(null);
      setNewRuleSegments(1);

      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  const handleRuleChange = async (rule: ConsecutiveMinuteRule, newSegments: number) => {
    const newMinutes = newSegments * SEGMENT_DURATION_MINUTES;

    // Optimistic update
    setRules((prev) => prev.map((r) => (r.roleId === rule.roleId ? { ...r, minutes: newMinutes } : r)));

    try {
      setError(null);
      await updateConsecutiveRule(rule.minCrewRoleRuleId, rule.maxCrewRoleRuleId, newSegments);

      if (onRefresh) onRefresh();
    } catch (err) {
      // Revert on error
      setRules((prev) => prev.map((r) => (r.roleId === rule.roleId ? rule : r)));
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const handleRuleRemove = async (rule: ConsecutiveMinuteRule) => {
    // Optimistic removal
    setRules((prev) => prev.filter((r) => r.roleId !== rule.roleId));

    try {
      setError(null);
      await deleteConsecutiveRule(rule.minCrewRoleRuleId, rule.maxCrewRoleRuleId);

      // Add role back to available
      const crewRes = await fetch(`${API_URL}/crew/${crewId}`);
      const crewData = await crewRes.json();
      const crewRole = (crewData.roles || []).find((cr: any) => cr.roleId === rule.roleId);
      if (crewRole) {
        setAvailableRoles((prev) => [
          ...prev,
          {
            id: crewRole.roleId,
            code: crewRole.Role?.code || '',
            displayName: crewRole.Role?.displayName || '',
          },
        ]);
      }

      if (onRefresh) onRefresh();
    } catch (err) {
      // Revert on error
      setRules((prev) => [...prev, rule]);
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
    if (isAdding) {
      setIsAdding(false);
      setNewRuleRoleId(null);
    }
  };

  const handleRoleDropdownEnter = () => {
    if (roleDropdownTimeoutRef.current) {
      clearTimeout(roleDropdownTimeoutRef.current);
      roleDropdownTimeoutRef.current = null;
    }
    setShowRoleDropdown(true);
  };

  const handleRoleDropdownLeave = () => {
    roleDropdownTimeoutRef.current = setTimeout(() => {
      setShowRoleDropdown(false);
    }, 200);
  };

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
        <div style={{ color: '#6B6B6B', fontSize: '14px' }}>Loading...</div>
      </CardContainer>
    );
  }

  return (
    <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {/* Error Banner */}
        {error && (
          <div
            style={{
              background: 'hsla(0, 84%, 60%, 0.1)',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ color: 'hsl(0, 84%, 45%)', fontSize: '13px', fontFamily: 'var(--font-open-sans)' }}>
              {error}
            </span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'hsl(0, 84%, 45%)',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Title Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          {/* Title Bubble */}
          <div
            className="ai-glass-border"
            style={{
              boxShadow: 'inset 0 0 0 1px rgba(220, 118, 38, 0.4)',
              borderRadius: '9999px',
              width: 'fit-content',
            }}
          >
            <div
              style={{
                background: 'hsla(25, 84%, 60%, 0.08)',
                borderRadius: '9999px',
                backdropFilter: 'blur(8px)',
                padding: '6px 14px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'hsla(25, 84%, 45%, 0.95)',
              }}
            >
              Consecutive Minutes
            </div>
          </div>

          {/* Add Button */}
          {isEditing && availableRoles.length > 0 && !isAdding && (
            <button
              onClick={handleAddClick}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '20px',
                fontWeight: 300,
                color: 'hsl(25, 84%, 60%)',
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              +
            </button>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Edit/Done Button */}
          <button
            onClick={handleToggleEdit}
            style={{
              background: 'transparent',
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
            {isEditing ? 'Done' : 'Edit'}
          </button>
        </div>

        {/* Add Flow Panel */}
        {isAdding && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.4)',
              borderRadius: '12px',
              padding: '12px',
              marginBottom: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Role Dropdown */}
            <div style={{ position: 'relative' }}>
              <div
                onMouseEnter={handleRoleDropdownEnter}
                onMouseLeave={handleRoleDropdownLeave}
                style={{
                  cursor: 'pointer',
                }}
              >
                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '8px 16px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    {newRuleRoleId ? availableRoles.find((r) => r.id === newRuleRoleId)?.displayName : 'Select Role'}
                  </div>
                </div>

                {/* Dropdown Menu */}
                {showRoleDropdown && availableRoles.length > 0 && (
                  <div
                    onMouseEnter={handleRoleDropdownEnter}
                    onMouseLeave={handleRoleDropdownLeave}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
                      padding: '4px',
                      zIndex: 100,
                      minWidth: '200px',
                    }}
                  >
                    {availableRoles.map((role) => (
                      <div
                        key={role.id}
                        onClick={() => {
                          setNewRuleRoleId(role.id);
                          setShowRoleDropdown(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          color: '#2C2C2C',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {role.displayName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Nested Pill Selector */}
            <NestedPillSegmentSelector
              selectedSegments={newRuleSegments}
              totalSegments={TOTAL_SEGMENTS}
              isEditing={true}
              onChange={setNewRuleSegments}
            />

            {/* Save/Cancel Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSaveAdd}
                disabled={!newRuleRoleId}
                style={{
                  background: newRuleRoleId ? 'hsl(25, 84%, 60%)' : '#E0E0E0',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 16px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'white',
                  cursor: newRuleRoleId ? 'pointer' : 'not-allowed',
                }}
              >
                Save
              </button>
              <button
                onClick={handleCancelAdd}
                style={{
                  background: 'transparent',
                  border: '1px solid #D0D0D0',
                  borderRadius: '8px',
                  padding: '6px 16px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6B6B6B',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing Rules List */}
        {rules.length === 0 && !isAdding && (
          <div
            style={{
              color: '#6B6B6B',
              fontSize: '14px',
              fontFamily: 'var(--font-open-sans)',
              textAlign: 'center',
              padding: '16px',
            }}
          >
            No consecutive minute preferences set
          </div>
        )}

        {rules.map((rule) => (
          <div key={rule.roleId} style={{ marginBottom: '12px' }}>
            <RoleConsecutiveCard
              rule={rule}
              isEditing={isEditing}
              onRemove={() => handleRuleRemove(rule)}
              onChange={(segments) => handleRuleChange(rule, segments)}
            />
          </div>
        ))}
      </div>
    </CardContainer>
  );
}
