'use client';

import { useState, useEffect, useRef } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard, GlassPillButton } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Constants - hardcoded for REGISTER/PRODUCT distribution
const ROLE_RULE_ID = 19; // DISTRIBUTION_BETWEEN_ROLE_X rule ID
const TOTAL_SEGMENTS = 3;
const SEGMENT_LABELS = ['Less', 'Equal', 'More'];

// Types
interface DistributionPreference {
  crewRoleRuleId: number | null;
  valueInt: number; // -1 = more REGISTER, 0 = balanced, 1 = more PRODUCT
}

interface RoleDistributionCardProps {
  crewId: string;
  onRefresh?: () => void;
}

interface DistributionSegmentSelectorProps {
  selectedSegment: number; // 1, 2, or 3
  isEditing: boolean;
  onChange: (segment: number) => void;
  onChangeEnd?: (segment: number) => void;
  disabled?: boolean;
}

// Convert valueInt to segment positions
function valueIntToSegments(valueInt: number) {
  return {
    registerSegment: 2 - valueInt, // -1→3, 0→2, 1→1
    productSegment: 2 + valueInt,   // -1→1, 0→2, 1→3
  };
}

// Convert segment change to valueInt
function registerSegmentToValueInt(segment: number): number {
  return 2 - segment;
}

function productSegmentToValueInt(segment: number): number {
  return segment - 2;
}

// DistributionSegmentSelector Component
function DistributionSegmentSelector({
  selectedSegment,
  isEditing,
  onChange,
  onChangeEnd,
  disabled = false,
}: DistributionSegmentSelectorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startSegmentRef = useRef(selectedSegment);
  const outerPillRef = useRef<HTMLDivElement>(null);
  const finalSegmentRef = useRef(selectedSegment);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing || disabled) return;

    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startSegmentRef.current = selectedSegment;
    finalSegmentRef.current = selectedSegment;
    setDragProgress(null);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!outerPillRef.current) return;

      const deltaX = e.clientX - startXRef.current;
      const outerPillWidth = outerPillRef.current.offsetWidth;
      const segmentWidth = outerPillWidth / TOTAL_SEGMENTS;

      // Calculate smooth progress (fractional segments)
      const rawSegmentDelta = deltaX / segmentWidth;
      const smoothSegment = Math.max(1, Math.min(TOTAL_SEGMENTS, startSegmentRef.current + rawSegmentDelta));
      setDragProgress(smoothSegment);

      // Calculate snapped segment for final value
      const segmentDelta = Math.round(deltaX / segmentWidth);
      const newSegment = Math.max(1, Math.min(TOTAL_SEGMENTS, startSegmentRef.current + segmentDelta));
      finalSegmentRef.current = newSegment;

      if (newSegment !== selectedSegment) {
        onChange(newSegment);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragProgress(null);
      // Only call onChangeEnd if value changed
      if (finalSegmentRef.current !== startSegmentRef.current && onChangeEnd) {
        onChangeEnd(finalSegmentRef.current);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, selectedSegment, onChange, onChangeEnd]);

  // Calculate segment label positions
  const segmentLabelPositions = SEGMENT_LABELS.map((label, idx) => ({
    label,
    left: ((idx + 0.5) / TOTAL_SEGMENTS) * 100,
  }));

  // Calculate divider positions
  const dividerPositions = [];
  for (let i = 1; i < TOTAL_SEGMENTS; i++) {
    dividerPositions.push((i / TOTAL_SEGMENTS) * 100);
  }

  // Calculate inner pill position and width
  // Pill always starts at left edge (0%) and extends to the right based on selected segment
  const displaySegment = dragProgress !== null ? dragProgress : selectedSegment;
  const innerPillLeft = 0;
  const innerPillWidth = (displaySegment / TOTAL_SEGMENTS) * 100;

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
        {segmentLabelPositions.map((seg, idx) => {
          // Check if this label's segment is covered by the inner pill
          const segStart = (idx / TOTAL_SEGMENTS) * 100;
          const segEnd = ((idx + 1) / TOTAL_SEGMENTS) * 100;
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
              {seg.label}
            </div>
          );
        })}

        {/* Inner Solid Pill - GREEN */}
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

// Role Row Component
interface RoleRowProps {
  roleName: string;
  selectedSegment: number;
  isEditing: boolean;
  onChange: (segment: number) => void;
  onChangeEnd?: (segment: number) => void;
}

function RoleRow({ roleName, selectedSegment, isEditing, onChange, onChangeEnd }: RoleRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
      {/* Role Name Label */}
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
              {roleName}
            </div>
          </div>
        </div>
      </div>

      {/* Segment Selector */}
      <DistributionSegmentSelector
        selectedSegment={selectedSegment}
        isEditing={isEditing}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />
    </div>
  );
}

// Main Component
export function RoleDistributionCard({ crewId, onRefresh }: RoleDistributionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [preference, setPreference] = useState<DistributionPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing preference
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${API_URL}/crew-role-rules?crewId=${crewId}`);
      if (!res.ok) throw new Error('Failed to fetch preferences');

      const crewRoleRules = await res.json();

      // Find DISTRIBUTION_BETWEEN_ROLE_X rule
      const distributionRule = (Array.isArray(crewRoleRules) ? crewRoleRules : []).find(
        (crr: any) => crr.roleRuleId === ROLE_RULE_ID
      );

      if (distributionRule) {
        setPreference({
          crewRoleRuleId: distributionRule.id,
          valueInt: distributionRule.valueInt ?? 0,
        });
      } else {
        // No preference yet - default to balanced
        setPreference({ crewRoleRuleId: null, valueInt: 0 });
      }
    } catch (err) {
      console.error('Error fetching distribution preference:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [crewId]);

  // Save preference to API
  const savePreference = async (newValueInt: number) => {
    if (!preference) return;

    const previousValue = preference.valueInt;

    try {
      setError(null);

      if (preference.crewRoleRuleId) {
        // Update existing
        const res = await authFetch(`${API_URL}/crew-role-rules/${preference.crewRoleRuleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInt: newValueInt }),
        });

        if (!res.ok) throw new Error('Failed to update preference');
      } else {
        // Create new
        const res = await authFetch(`${API_URL}/crew-role-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crewId,
            roleRuleId: ROLE_RULE_ID,
            valueInt: newValueInt,
            isPriority: true,
          }),
        });

        if (!res.ok) throw new Error('Failed to create preference');

        const created = await res.json();
        setPreference((prev) => (prev ? { ...prev, crewRoleRuleId: created.id } : null));
      }

      onRefresh?.();
    } catch (err) {
      // Revert on error
      setPreference((prev) => (prev ? { ...prev, valueInt: previousValue } : null));
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  // Handle segment changes
  const handleRegisterChange = (segment: number) => {
    const newValueInt = registerSegmentToValueInt(segment);
    setPreference((prev) => (prev ? { ...prev, valueInt: newValueInt } : null));
  };

  const handleProductChange = (segment: number) => {
    const newValueInt = productSegmentToValueInt(segment);
    setPreference((prev) => (prev ? { ...prev, valueInt: newValueInt } : null));
  };

  const handleChangeEnd = () => {
    if (preference) {
      savePreference(preference.valueInt);
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

  const { registerSegment, productSegment } = valueIntToSegments(preference?.valueInt ?? 0);

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
                  Role Distribution
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
            <span
              style={{ color: 'hsl(0, 84%, 45%)', fontSize: '13px', fontFamily: 'var(--font-open-sans)' }}
            >
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

        {/* Role Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <RoleRow
            roleName="Register"
            selectedSegment={registerSegment}
            isEditing={isEditing}
            onChange={handleRegisterChange}
            onChangeEnd={handleChangeEnd}
          />
          <RoleRow
            roleName="Product"
            selectedSegment={productSegment}
            isEditing={isEditing}
            onChange={handleProductChange}
            onChangeEnd={handleChangeEnd}
          />
        </div>
      </div>
    </CardContainer>
  );
}
