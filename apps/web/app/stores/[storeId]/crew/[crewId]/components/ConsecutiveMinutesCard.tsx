'use client';

import { useState, useEffect, useRef } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard, GlassPillButton } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Constants
const SEGMENT_DURATION_MINUTES = 60;
const TOTAL_SEGMENTS = 3;

// Types
interface ConsecutiveMinuteRule {
  maxCrewRoleRuleId: number | null;  // Crew's MAX override (if exists)
  maxRoleRuleId: number | null;      // RoleRule ID for MAX type
  roleId: number;
  roleName: string;
  storeMinMinutes: number;           // Store's MIN (from StoreRoleRule) - read-only
  crewMaxMinutes: number;            // Crew's preferred MAX
}

interface NestedPillSegmentSelectorProps {
  selectedSegments: number;       // MAX segment (draggable right edge)
  totalSegments: number;          // Total segments (3)
  isEditing: boolean;
  onChange: (segments: number) => void;
  onChangeEnd?: (segments: number) => void;  // Called on mouse up - for API save
  disabled?: boolean;
  minSegment?: number;            // MIN segment (locked left edge) - optional for backwards compat
}

interface RoleConsecutiveCardProps {
  rule: ConsecutiveMinuteRule;
  isEditing: boolean;
  onChange: (segments: number) => void;
  onChangeEnd?: (segments: number) => void;
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
  onChangeEnd,
  disabled = false,
  minSegment = 1,
}: NestedPillSegmentSelectorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null); // Smooth drag position (0-1 scale relative to drag range)
  const startXRef = useRef(0);
  const startSegmentsRef = useRef(selectedSegments);
  const outerPillRef = useRef<HTMLDivElement>(null);
  const finalSegmentsRef = useRef(selectedSegments);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing || disabled) return;

    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startSegmentsRef.current = selectedSegments;
    finalSegmentsRef.current = selectedSegments;
    setDragProgress(null);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!outerPillRef.current) return;

      const deltaX = e.clientX - startXRef.current;
      const outerPillWidth = outerPillRef.current.offsetWidth;
      const segmentWidth = outerPillWidth / totalSegments;

      // Calculate smooth progress (fractional segments)
      const rawSegmentDelta = deltaX / segmentWidth;
      const smoothSegments = Math.max(minSegment, Math.min(totalSegments, startSegmentsRef.current + rawSegmentDelta));
      setDragProgress(smoothSegments);

      // Calculate snapped segment for final value
      const segmentDelta = Math.round(deltaX / segmentWidth);
      const newSegments = Math.max(minSegment, Math.min(totalSegments, startSegmentsRef.current + segmentDelta));
      finalSegmentsRef.current = newSegments;

      if (newSegments !== selectedSegments) {
        onChange(newSegments);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragProgress(null);
      // Only call onChangeEnd if value changed
      if (finalSegmentsRef.current !== startSegmentsRef.current && onChangeEnd) {
        onChangeEnd(finalSegmentsRef.current);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, selectedSegments, totalSegments, minSegment, onChange, onChangeEnd]);

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

  // Calculate inner pill position and width (from minSegment to selectedSegments)
  // Use dragProgress for smooth animation while dragging, otherwise use selectedSegments
  const displaySegments = dragProgress !== null ? dragProgress : selectedSegments;
  const innerPillLeft = ((minSegment - 1) / totalSegments) * 100;
  const innerPillWidth = ((displaySegments - minSegment + 1) / totalSegments) * 100;

  return (
    <GlassPillCard
      borderRadius="9999px"
      padding="0"
      backgroundOpacity={0.6}
      style={{ width: '100%', flex: 1 }}
    >
      <div
        ref={outerPillRef}
        style={{ position: 'relative', minHeight: '38px', padding: '16px', width: '100%' }}
      >
        {/* Segment Dividers */}
        {dividerPositions.map((left, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: '50%',
              transform: 'translateY(-50%)',
              height: 'calc(100% + 8px)',
              width: '1px',
              background: 'linear-gradient(to bottom, transparent 0%, hsla(0, 0%, 0%, 0.12) 48%, hsla(0, 0%, 0%, 0.12) 52%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        ))}

        {/* Segment Labels */}
        {segmentLabels.map((seg) => {
          // Check if this label is covered by the inner pill
          const segStart = ((seg.label - 1) / totalSegments) * 100;
          const segEnd = (seg.label / totalSegments) * 100;
          const isCovered = segStart >= innerPillLeft && segEnd <= (innerPillLeft + innerPillWidth);

          return (
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
                color: isCovered ? 'rgb(22, 163, 74)' : '#6B6B6B',
                pointerEvents: 'none',
                zIndex: 3,
                transition: 'color 0.15s ease',
              }}
            >
              {seg.label} hr
            </div>
          );
        })}

        {/* Inner Solid Pill (from minSegment to selectedSegments) - TRANSLUCENT GREEN */}
        <GlassPillCard
          borderRadius="9999px"
          padding="0"
          backgroundOpacity={0.6}
          borderOpacity={0.4}
          style={{
            position: 'absolute',
            left: `calc(${innerPillLeft}% + 16px)`,
            top: '50%',
            transform: 'translateY(-50%)',
            height: '34px',
            width: `calc(${innerPillWidth}% - 32px)`,
            transition: isDragging ? 'none' : 'left 0.15s ease, width 0.15s ease, opacity 0.15s ease',
            opacity: isDragging ? 0.8 : 1,
            cursor: isEditing && !disabled ? 'ew-resize' : 'default',
            zIndex: 0,
            '--border-color': '34, 197, 94',
          } as React.CSSProperties}
          contentStyle={{
            background: 'rgba(34, 197, 94, 0.35)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            width: '100%',
            height: '100%',
          }}
        >
          <div onMouseDown={handleMouseDown} style={{ width: '100%', height: '100%' }} />
        </GlassPillCard>
      </div>
    </GlassPillCard>
  );
}

// RoleConsecutiveCard Component
function RoleConsecutiveCard({ rule, isEditing, onChange, onChangeEnd }: RoleConsecutiveCardProps) {
  const minSegment = Math.ceil(rule.storeMinMinutes / SEGMENT_DURATION_MINUTES);
  const maxSegment = Math.ceil(rule.crewMaxMinutes / SEGMENT_DURATION_MINUTES);

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
      {/* Role Name - Separate Outer Card */}
      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content', flexShrink: 0 }}>
        <div
          style={{
            ...aiGlassLightContentStyle('9999px', 0.3),
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            boxSizing: 'border-box',
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
              {rule.roleName}
            </div>
          </div>
        </div>
      </div>

      {/* Nested Pill Selector - Separate Outer Card */}
      <NestedPillSegmentSelector
        selectedSegments={maxSegment}
        totalSegments={TOTAL_SEGMENTS}
        isEditing={isEditing}
        onChange={(newSegments) => onChange(newSegments)}
        onChangeEnd={onChangeEnd}
        minSegment={minSegment}
      />
    </div>
  );
}

// Main Component
export function ConsecutiveMinutesCard({ crewId, storeId, onRefresh }: ConsecutiveMinutesCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [rules, setRules] = useState<ConsecutiveMinuteRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all store consecutive rules (both MIN and MAX)
      const storeRulesRes = await authFetch(`${API_URL}/stores/${storeId}/effective-role-rules`);
      if (!storeRulesRes.ok) throw new Error('Failed to fetch store rules');
      const storeRulesResponse = await storeRulesRes.json();

      // API returns { storeId, crewId, rules: [...] }
      const storeRulesData = storeRulesResponse.rules || [];

      // Filter store MIN consecutive rules from StoreRoleRule entries
      const storeMinRules = storeRulesData.filter(
        (rule: any) => rule.RoleRule?.type === 'MIN_CONSECUTIVE_MINUTES' && rule.source === 'store'
      );

      // Filter store MAX consecutive rules from StoreRoleRule entries
      const storeMaxRules = storeRulesData.filter(
        (rule: any) => rule.RoleRule?.type === 'MAX_CONSECUTIVE_MINUTES' && rule.source === 'store'
      );

      // Build map of store MAX by roleId
      const storeMaxByRole: Record<number, any> = {};
      storeMaxRules.forEach((rule: any) => {
        const roleId = rule.RoleRule?.roleId;
        if (roleId) {
          storeMaxByRole[roleId] = rule;
        }
      });

      // Fetch crew MAX overrides
      const crewRulesRes = await authFetch(`${API_URL}/crew-role-rules?crewId=${crewId}`);
      if (!crewRulesRes.ok) throw new Error('Failed to fetch crew rules');
      const crewRulesData = await crewRulesRes.json();

      // Filter crew MAX consecutive rules
      const crewMaxRules = (Array.isArray(crewRulesData) ? crewRulesData : []).filter(
        (rr: any) => rr.RoleRule?.type === 'MAX_CONSECUTIVE_MINUTES'
      );

      // Build map of crew MAX overrides by roleId
      const crewMaxByRole: Record<number, any> = {};
      crewMaxRules.forEach((rr: any) => {
        const roleId = rr.RoleRule?.roleId;
        if (roleId) {
          crewMaxByRole[roleId] = rr;
        }
      });

      // Build ConsecutiveMinuteRule objects for all roles with store MIN rules
      const parsedRules: ConsecutiveMinuteRule[] = storeMinRules.map((storeMinRule: any) => {
        const roleId = storeMinRule.RoleRule?.roleId;
        const storeMinMinutes = storeMinRule.RoleRule?.valueInt || 60;

        // Get store MAX for this role (defaults to store MIN if not found)
        const storeMaxRule = storeMaxByRole[roleId];
        const storeMaxMinutes = storeMaxRule?.RoleRule?.valueInt || storeMinMinutes;

        // Get crew MAX override (defaults to store MAX)
        const crewMaxRule = crewMaxByRole[roleId];
        const crewMaxMinutes = crewMaxRule?.valueInt || storeMaxMinutes;

        return {
          maxCrewRoleRuleId: crewMaxRule?.id || null,
          maxRoleRuleId: crewMaxRule?.roleRuleId || null,
          roleId: roleId,
          roleName: storeMinRule.RoleRule?.Role?.displayName || storeMinRule.RoleRule?.Role?.code || 'Unknown',
          storeMinMinutes,
          crewMaxMinutes,
        };
      });

      setRules(parsedRules);
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

  // API helper - simplified to only update/create crew MAX override
  // Returns the new crewRoleRuleId if created, otherwise null
  const updateCrewMaxOverride = async (rule: ConsecutiveMinuteRule, newSegments: number): Promise<number | null> => {
    const newMaxMinutes = newSegments * SEGMENT_DURATION_MINUTES;

    // If crew already has MAX override, update it
    if (rule.maxCrewRoleRuleId) {
      const res = await authFetch(`${API_URL}/crew-role-rules/${rule.maxCrewRoleRuleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInt: newMaxMinutes }),
      });

      if (!res.ok) throw new Error('Failed to update crew MAX override');
      return null; // No new ID, just updated
    }

    // Otherwise, create new crew MAX override
    // First, query for the store's MAX RoleRule ID
    const roleRulesRes = await fetch(
      `${API_URL}/role-rules?storeId=${storeId}&roleId=${rule.roleId}&type=MAX_CONSECUTIVE_MINUTES`
    );

    if (!roleRulesRes.ok) throw new Error('Failed to fetch store role rules');

    const roleRules = await roleRulesRes.json();

    if (roleRules.length === 0) {
      throw new Error('Store MAX RoleRule not found for this role');
    }

    const maxRoleRuleId = roleRules[0].id;

    // Create crew override
    const createRes = await authFetch(`${API_URL}/crew-role-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crewId,
        roleRuleId: maxRoleRuleId,
        valueInt: newMaxMinutes,
      }),
    });

    if (!createRes.ok) throw new Error('Failed to create crew MAX override');

    // Return the new ID so we can update local state
    const created = await createRes.json();
    return created.id;
  };

  // Event handlers
  // Local state update only (no API call) - for smooth dragging
  const handleRuleChange = (rule: ConsecutiveMinuteRule, newSegments: number) => {
    const newMaxMinutes = newSegments * SEGMENT_DURATION_MINUTES;
    setRules((prev) =>
      prev.map((r) =>
        r.roleId === rule.roleId ? { ...r, crewMaxMinutes: newMaxMinutes } : r
      )
    );
  };

  // API save on drag end
  const handleRuleChangeEnd = async (rule: ConsecutiveMinuteRule, newSegments: number) => {
    try {
      setError(null);
      const newCrewRoleRuleId = await updateCrewMaxOverride(rule, newSegments);

      // If a new crew rule was created, update local state with the new ID (no refetch needed)
      if (newCrewRoleRuleId !== null) {
        setRules((prev) =>
          prev.map((r) =>
            r.roleId === rule.roleId ? { ...r, maxCrewRoleRuleId: newCrewRoleRuleId } : r
          )
        );
      }

      if (onRefresh) onRefresh();
    } catch (err) {
      // Revert on error
      setRules((prev) =>
        prev.map((r) => (r.roleId === rule.roleId ? rule : r))
      );
      setError(err instanceof Error ? err.message : 'Failed to update MAX override');
    }
  };

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Embedded header bar */}
        <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
          <div
            className="ai-glass-border"
            style={aiGlassLightBorderStyle('1rem 1rem 0 0', '0, 0, 0', 0.08)}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('1rem 1rem 0 0', 0.6),
                padding: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
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
                  Continuous Time on Role
                </div>
              </div>
              <GlassPillButton
                onClick={handleToggleEdit}
                isSelected={false}
                padding="6px 14px"
              >
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: isEditing ? '#DC2626' : '#6B6B6B',
                  }}
                >
                  {isEditing ? 'Done' : 'Edit'}
                </span>
              </GlassPillButton>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            style={{
              background: 'hsla(0, 84%, 60%, 0.1)',
              borderRadius: '8px',
              padding: '8px 12px',
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

        {/* Roles List */}
        {rules.length === 0 ? (
          <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
            <div
              style={{
                ...aiGlassLightContentStyle('9999px', 0.3),
                padding: '16px',
                color: '#9B9B9B',
                fontSize: '12px',
                fontFamily: 'var(--font-open-sans)',
                textAlign: 'center',
              }}
            >
              No preferences set
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rules.map((rule) => (
              <RoleConsecutiveCard
                key={rule.roleId}
                rule={rule}
                isEditing={isEditing}
                onChange={(segments) => handleRuleChange(rule, segments)}
                onChangeEnd={(segments) => handleRuleChangeEnd(rule, segments)}
              />
            ))}
          </div>
        )}
      </div>
    </CardContainer>
  );
}
