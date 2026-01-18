'use client';

import { useState, useEffect } from 'react';
import { CardContainer, GlassPillCard, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Role {
  id: number;
  code: string;
  displayName: string;
}

interface HourPreference {
  id: number;                    // CrewRoleRule ID
  crewRoleRuleId: number;        // Same as id
  roleRuleId: number;            // The RoleRule ID
  roleId: number;                // Role being liked/disliked
  roleName: string;
  hour: number;                  // Hour number (1, 2, 3...)
  type: 'LIKE_ROLE_FOR_HOUR_X' | 'DISLIKE_ROLE_FOR_HOUR_X';
}

interface RolePreferenceByHourCardProps {
  crewId: string;
  storeId: string;
  onRefresh?: () => void;
}

export function RolePreferenceByHourCard({ crewId, storeId, onRefresh }: RolePreferenceByHourCardProps) {
  // State management
  const [isEditing, setIsEditing] = useState(false);
  const [preferences, setPreferences] = useState<HourPreference[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add flow state
  const [isAdding, setIsAdding] = useState(false);
  const [newHourInput, setNewHourInput] = useState<string>('1');
  const [newRoleId, setNewRoleId] = useState<number | null>(null);
  const [newPreferenceType, setNewPreferenceType] = useState<'work' | 'avoid'>('work');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [dropdownCloseTimeout, setDropdownCloseTimeout] = useState<NodeJS.Timeout | null>(null);
  const [typeDropdownCloseTimeout, setTypeDropdownCloseTimeout] = useState<NodeJS.Timeout | null>(null);

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

      // Extract crew's accessible roles
      const crewRoles = (crewData.roles || []).map((cr: any) => ({
        id: cr.roleId,
        code: cr.role.code,
        displayName: cr.role.displayName,
      }));

      if (crewRoles.length === 0) {
        setPreferences([]);
        setAvailableRoles([]);
        return;
      }

      // Filter existing LIKE/DISLIKE_ROLE_FOR_HOUR_X rules for this crew
      const hourPreferences = (crewData.roleRules || [])
        .filter((crr: any) =>
          crr.roleRule?.type === 'LIKE_ROLE_FOR_HOUR_X' ||
          crr.roleRule?.type === 'DISLIKE_ROLE_FOR_HOUR_X'
        )
        .map((crr: any) => {
          const valueInt = crr.valueInt ?? 0;
          const hour = Math.floor(valueInt / 60) + 1; // Convert minutes to hour number

          return {
            id: crr.id,
            crewRoleRuleId: crr.id,
            roleRuleId: crr.roleRuleId,
            roleId: crr.roleRule?.role?.id,
            roleName: crr.roleRule?.role?.displayName || crr.roleRule?.role?.code || 'Unknown',
            hour,
            type: crr.roleRule?.type,
          };
        });

      setPreferences(hourPreferences);
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

  // Start adding new preference
  const handleStartAdding = () => {
    setIsAdding(true);
    setNewHourInput('1');
    setNewRoleId(null);
    setNewPreferenceType('work');
  };

  // Cancel adding
  const handleCancelAdd = () => {
    setIsAdding(false);
    setIsEditing(false);
    setNewHourInput('1');
    setNewRoleId(null);
    setNewPreferenceType('work');
    setShowRoleDropdown(false);
    setShowTypeDropdown(false);
  };

  // Confirm and save new preference
  const handleConfirmAdd = async () => {
    const hour = Number(newHourInput) || 1;
    if (!newRoleId || hour < 1 || hour > 12) return;

    const roleId = newRoleId;
    const valueInt = (hour - 1) * 60; // Convert hour to minutes
    const type = newPreferenceType === 'work' ? 'LIKE_ROLE_FOR_HOUR_X' : 'DISLIKE_ROLE_FOR_HOUR_X';

    setIsAdding(false);
    setIsEditing(false);
    setNewHourInput('1');
    setNewRoleId(null);
    setNewPreferenceType('work');
    setShowRoleDropdown(false);
    setShowTypeDropdown(false);

    try {
      // Step 1: Check if RoleRule already exists for this role + type
      const existingRuleRes = await fetch(
        `${API_URL}/role-rules?storeId=${storeId}`
      );

      if (!existingRuleRes.ok) {
        setError('Failed to fetch existing rules');
        return;
      }

      const allStoreRules = await existingRuleRes.json();
      // Filter by type and roleId in-memory since API doesn't support type filter
      const existingRule = allStoreRules.find(
        (rr: any) => rr.roleId === roleId && rr.type === type
      );

      let roleRuleId: number;

      if (existingRule) {
        // Reuse existing RoleRule
        roleRuleId = existingRule.id;

        // Check if crew already assigned to this rule with this hour (prevent duplicate)
        const alreadyAssigned = preferences.some(
          p => p.roleRuleId === roleRuleId && p.hour === hour
        );
        if (alreadyAssigned) {
          setError('You already have this preference');
          return;
        }
      } else {
        // Step 2: Create new SOFT RoleRule
        const createRuleRes = await fetch(`${API_URL}/role-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleId: roleId,
            type: type,
            constraintType: 'SOFT',
          }),
        });

        if (!createRuleRes.ok) {
          const errorData = await createRuleRes.json();

          // Handle unique constraint violation (P2002) - race condition
          if (errorData.error?.includes('P2002') || errorData.error?.includes('unique') || errorData.error?.includes('Duplicate')) {
            // Race condition: rule was created by another request
            // Fetch again to get the ID
            const refetchRes = await fetch(
              `${API_URL}/role-rules?storeId=${storeId}`
            );
            const refetchedRules = await refetchRes.json();
            const newlyCreatedRule = refetchedRules.find(
              (rr: any) => rr.roleId === roleId && rr.type === type
            );

            if (newlyCreatedRule) {
              roleRuleId = newlyCreatedRule.id;
            } else {
              setError('Failed to create preference');
              return;
            }
          } else {
            console.error('Failed to create RoleRule:', errorData);
            setError('Failed to create preference');
            return;
          }
        } else {
          const newRule = await createRuleRes.json();
          roleRuleId = newRule.id;
        }
      }

      // Step 3: Assign RoleRule to crew via CrewRoleRule with valueInt
      const assignRes = await fetch(`${API_URL}/crew-role-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewId,
          roleRuleId,
          valueInt,
        }),
      });

      if (!assignRes.ok) {
        const errorData = await assignRes.json();
        console.error('Failed to assign rule:', errorData);
        setError('Failed to add preference');
        return;
      }

      // Refresh data
      await fetchData();
      onRefresh?.();
    } catch (err) {
      console.error('Failed to add preference:', err);
      setError('Failed to add preference');
    }
  };

  // Remove preference
  const handleRemove = async (preferenceId: number) => {
    const preference = preferences.find(p => p.id === preferenceId);
    if (!preference) return;

    // Optimistic update
    setPreferences(prev => prev.filter(p => p.id !== preferenceId));

    try {
      const res = await fetch(`${API_URL}/crew-role-rules/${preference.crewRoleRuleId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        // Revert on failure
        await fetchData();
        setError('Failed to remove preference');
        console.error('Failed to remove preference');
      } else {
        onRefresh?.();
      }
    } catch (err) {
      // Revert on error
      await fetchData();
      setError('Failed to remove preference');
      console.error('Failed to remove preference:', err);
    }
  };

  // Group preferences by hour
  const groupedByHour = preferences.reduce((acc, pref) => {
    if (!acc[pref.hour]) {
      acc[pref.hour] = { liked: [], disliked: [] };
    }
    if (pref.type === 'LIKE_ROLE_FOR_HOUR_X') {
      acc[pref.hour].liked.push(pref);
    } else {
      acc[pref.hour].disliked.push(pref);
    }
    return acc;
  }, {} as Record<number, { liked: HourPreference[]; disliked: HourPreference[] }>);

  const sortedHours = Object.keys(groupedByHour).map(Number).sort((a, b) => a - b);

  // Filter available roles based on current hour selection
  // Exclude roles that already have ANY preference (like or dislike) for the selected hour
  // since you can't both like and dislike the same role for the same hour
  const filteredRolesForDropdown = availableRoles.filter((role) => {
    const currentHour = Number(newHourInput) || 1;

    // Check if this role+hour combo already exists (either like or dislike)
    const alreadyExists = preferences.some(
      (p) => p.roleId === role.id && p.hour === currentHour
    );

    return !alreadyExists;
  });

  // Role bubble component
  function RoleBubble({
    roleName,
    type,
    isEditing,
    onRemove,
  }: {
    roleName: string;
    type: 'LIKE_ROLE_FOR_HOUR_X' | 'DISLIKE_ROLE_FOR_HOUR_X';
    isEditing: boolean;
    onRemove?: () => void;
  }) {
    const isLiked = type === 'LIKE_ROLE_FOR_HOUR_X';
    const borderColor = isLiked ? '34, 197, 94' : '220, 38, 38'; // green-500 or red-600
    const bgColor = isLiked ? 'rgba(34, 197, 94, 0.08)' : 'rgba(220, 38, 38, 0.08)';
    const textColor = isLiked ? 'rgb(22, 163, 74)' : 'rgb(185, 28, 28)'; // green-600 or red-700

    return (
      <div
        style={{
          position: 'relative',
        }}
        className={isEditing ? 'ios-wiggle' : ''}
      >
        {/* Remove button - appears in top-left corner during edit mode */}
        {isEditing && onRemove && (
          <div
            className="ai-glass-border"
            style={{
              ...aiGlassLightBorderStyle('50%', '0, 0, 0', 0.12),
              position: 'absolute',
              top: '-4px',
              left: '-4px',
              width: '16px',
              height: '16px',
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
                fontSize: '12px',
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
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('9999px', borderColor, 0.4),
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('9999px', 0.6),
              backgroundColor: bgColor,
              padding: '4px 10px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '12px',
              fontWeight: 500,
              color: textColor,
            }}
          >
            {roleName}
          </div>
        </div>
      </div>
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
            {/* Title badge */}
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
                Role Preferences by Hour
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
                disabled={!newRoleId}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: newRoleId ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 400,
                  color: newRoleId ? 'hsl(0, 84%, 60%)' : '#9B9B9B',
                }}
              >
                Save
              </button>
              <button
                onClick={handleCancelAdd}
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
                setNewHourInput('1');
                setNewRoleId(null);
                setNewPreferenceType('work');
                setShowRoleDropdown(false);
                setShowTypeDropdown(false);
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

        {/* New preference being added */}
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
              {/* Text: "Hour" */}
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  color: '#6B6B6B',
                  paddingLeft: '10px',
                }}
              >
                Hour
              </span>

              {/* Hour input */}
              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newHourInput}
                  onFocus={() => {
                    // Clear on focus so user can type fresh
                    setNewHourInput('');
                  }}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    // Allow empty or valid numbers 1-12
                    if (val === '' || (Number(val) >= 0 && Number(val) <= 12)) {
                      setNewHourInput(val);
                    }
                  }}
                  onBlur={(e) => {
                    // Ensure value is valid on blur
                    const num = Number(e.target.value);
                    let newHour = '1';
                    if (e.target.value === '' || num < 1) {
                      newHour = '1';
                    } else if (num > 12) {
                      newHour = '12';
                    } else {
                      newHour = String(num);
                    }
                    // Only clear role if hour actually changed
                    if (newHour !== newHourInput) {
                      setNewHourInput(newHour);
                      setNewRoleId(null);
                    } else {
                      setNewHourInput(newHour);
                    }
                  }}
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.6),
                    padding: '4px 10px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                    border: 'none',
                    width: `${Math.max(32, (newHourInput.length || 1) * 9 + 20)}px`,
                    textAlign: 'center',
                    MozAppearance: 'textfield',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                  }}
                  placeholder="1"
                />
              </div>

              {/* Text: "preference is to" */}
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  color: '#6B6B6B',
                }}
              >
                preference is to
              </span>

              {/* Work/Avoid Dropdown */}
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  if (typeDropdownCloseTimeout) {
                    clearTimeout(typeDropdownCloseTimeout);
                    setTypeDropdownCloseTimeout(null);
                  }
                  setShowTypeDropdown(true);
                }}
                onMouseLeave={() => {
                  const timeout = setTimeout(() => setShowTypeDropdown(false), 200);
                  setTypeDropdownCloseTimeout(timeout);
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
                      color: '#2C2C2C',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {newPreferenceType}
                  </div>
                </div>
                {showTypeDropdown && (
                  <div
                    onMouseEnter={() => {
                      if (typeDropdownCloseTimeout) {
                        clearTimeout(typeDropdownCloseTimeout);
                        setTypeDropdownCloseTimeout(null);
                      }
                      setShowTypeDropdown(true);
                    }}
                    onMouseLeave={() => {
                      const timeout = setTimeout(() => setShowTypeDropdown(false), 200);
                      setTypeDropdownCloseTimeout(timeout);
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
                      minWidth: '100px',
                    }}
                  >
                    <button
                      onClick={() => {
                        setNewPreferenceType('work');
                        setNewRoleId(null); // Clear role when type changes
                        setShowTypeDropdown(false);
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
                      work
                    </button>
                    <button
                      onClick={() => {
                        setNewPreferenceType('avoid');
                        setNewRoleId(null); // Clear role when type changes
                        setShowTypeDropdown(false);
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
                      avoid
                    </button>
                  </div>
                )}
              </div>

              {/* Role Dropdown */}
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  if (dropdownCloseTimeout) {
                    clearTimeout(dropdownCloseTimeout);
                    setDropdownCloseTimeout(null);
                  }
                  setShowRoleDropdown(true);
                }}
                onMouseLeave={() => {
                  const timeout = setTimeout(() => setShowRoleDropdown(false), 200);
                  setDropdownCloseTimeout(timeout);
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
                      color: newRoleId ? '#2C2C2C' : '#9B9B9B',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {newRoleId
                      ? availableRoles.find(r => r.id === newRoleId)?.displayName || 'Select'
                      : 'Select role'}
                  </div>
                </div>
                {showRoleDropdown && (
                  <div
                    onMouseEnter={() => {
                      if (dropdownCloseTimeout) {
                        clearTimeout(dropdownCloseTimeout);
                        setDropdownCloseTimeout(null);
                      }
                      setShowRoleDropdown(true);
                    }}
                    onMouseLeave={() => {
                      const timeout = setTimeout(() => setShowRoleDropdown(false), 200);
                      setDropdownCloseTimeout(timeout);
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
                    {filteredRolesForDropdown.length === 0 ? (
                      <div
                        style={{
                          padding: '8px 12px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '12px',
                          color: '#9B9B9B',
                          fontStyle: 'italic',
                        }}
                      >
                        All roles already set
                      </div>
                    ) : (
                      filteredRolesForDropdown.map((role) => (
                        <button
                          key={role.id}
                          onClick={() => {
                            setNewRoleId(role.id);
                            setShowRoleDropdown(false);
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
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </GlassPillCard>
        )}

        {/* Hour rows */}
        {sortedHours.length === 0 ? (
          <GlassPillCard borderRadius="9999px" padding="16px" style={{ width: 'fit-content' }}>
            <div style={{ color: '#9B9B9B', fontSize: '12px', textAlign: 'center', fontFamily: 'var(--font-open-sans)' }}>
              No preferences set
            </div>
          </GlassPillCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sortedHours.map((hour) => {
              const { liked, disliked } = groupedByHour[hour];
              const hasRoles = liked.length > 0 || disliked.length > 0;

              return (
                <GlassPillCard
                  key={hour}
                  borderRadius="9999px"
                  padding="16px"
                  style={{ width: 'fit-content' }}
                  contentStyle={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: hasRoles ? '10px' : '0px',
                    minHeight: '36px',
                  }}
                >
                  {/* Hour label */}
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content', flexShrink: 0 }}>
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
                      Hour {hour}
                    </div>
                  </div>

                  {/* Role bubbles */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {liked.map((pref) => (
                      <RoleBubble
                        key={pref.id}
                        roleName={pref.roleName}
                        type="LIKE_ROLE_FOR_HOUR_X"
                        isEditing={isEditing}
                        onRemove={() => handleRemove(pref.id)}
                      />
                    ))}
                    {disliked.map((pref) => (
                      <RoleBubble
                        key={pref.id}
                        roleName={pref.roleName}
                        type="DISLIKE_ROLE_FOR_HOUR_X"
                        isEditing={isEditing}
                        onRemove={() => handleRemove(pref.id)}
                      />
                    ))}
                  </div>
                </GlassPillCard>
              );
            })}
          </div>
        )}
      </div>
    </CardContainer>
  );
}
