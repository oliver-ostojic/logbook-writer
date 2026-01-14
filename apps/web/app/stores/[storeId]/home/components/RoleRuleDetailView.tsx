'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RoleRuleDetailViewProps {
  ruleId: number;
  constraintType: 'HARD' | 'SOFT';
}

interface RoleRuleData {
  id: number;
  roleId: number;
  type: string;
  targetRoleId?: number | null;
  valueInt?: number | null;
  constraintType: string;
  displayName?: string | null;
  description?: string | null;
  Role?: { id: number; code: string; displayName: string };
  TargetRole?: { id: number; code: string; displayName: string };
  CrewRoleRules?: Array<{
    id: number;
    crewId: string;
    isPriority: boolean;
    Crew: { id: string; name: string };
  }>;
  StoreRoleRules?: Array<{
    id: number;
    storeId: number;
    isPriority: boolean;
    Store: { id: number; name: string };
  }>;
}

const ROLE_RULE_TYPE_LABELS: Record<string, string> = {
  'CANNOT_BE_ASSIGNED_BEFORE': 'Cannot Be Assigned Before',
  'CANNOT_BE_ASSIGNED_AFTER': 'Cannot Be Assigned After',
  'MIN_CONSECUTIVE_MINUTES': 'Min Consecutive Minutes',
  'MAX_CONSECUTIVE_MINUTES': 'Max Consecutive Minutes',
  'FORBID_ROLE': 'Forbid Role',
  'TIMING': 'Timing',
  'LIKE_ROLE_FOR_HOUR_X': 'Like Role for Hour',
  'DISLIKE_ROLE_FOR_HOUR_X': 'Dislike Role for Hour',
  'MIN_SHIFT_LENGTH_FOR_ACCESS': 'Min Shift Length for Access',
  'ASSIGN_BEFORE_SHIFT_MIN_X': 'Assign Before Shift Minute',
  'ASSIGN_AFTER_SHIFT_MIN_X': 'Assign After Shift Minute',
  'MAX_CREW_ON_AT_A_TIME': 'Max Crew On at a Time',
  'ALLOW_HALF_BLOCKSIZE': 'Allow Half Block Size',
  'DISTRIBUTION_BETWEEN_ROLE_X': 'Distribution Between Role',
  'CANNOT_ASSIGN_DURING_STORE_HOUR_X': 'Cannot Assign During Store Hour',
};

export function RoleRuleDetailView({ ruleId, constraintType }: RoleRuleDetailViewProps) {
  const [rule, setRule] = useState<RoleRuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/role-rules/${ruleId}`);
        if (!res.ok) throw new Error('Failed to load rule data');
        const data = await res.json();

        if (!cancelled) setRule(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [ruleId]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !rule) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: 'rgb(220, 38, 38)' }}>
            {error || 'Rule not found'}
          </span>
        </div>
      </CardContainer>
    );
  }

  const sectionHeaderStyle = {
    fontFamily: 'var(--font-open-sans)',
    fontSize: '14px',
    fontWeight: 600,
    color: '#2C2C2C',
    marginBottom: '12px',
  };

  const labelStyle = {
    fontFamily: 'var(--font-open-sans)',
    fontSize: '12px',
    fontWeight: 500,
    color: '#9A999E',
  };

  const valueStyle = {
    fontFamily: 'var(--font-open-sans)',
    fontSize: '14px',
    color: '#2C2C2C',
  };

  return (
    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
      <div className="flex flex-col gap-6">
        {/* Basic Info Section */}
        <div>
          <div style={sectionHeaderStyle}>Basic Information</div>
          <div className="flex flex-col gap-3">
            {/* Role */}
            <div>
              <div style={labelStyle}>Role</div>
              <div style={valueStyle}>
                {rule.Role?.displayName || 'Unknown'}
              </div>
            </div>

            {/* Rule Type */}
            <div>
              <div style={labelStyle}>Rule Type</div>
              <div style={valueStyle}>
                {ROLE_RULE_TYPE_LABELS[rule.type] || rule.type}
              </div>
            </div>

            {/* Constraint Type */}
            <div>
              <div style={labelStyle}>Constraint Type</div>
              <div style={valueStyle}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: rule.constraintType === 'HARD' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                    color: rule.constraintType === 'HARD' ? 'rgb(220, 38, 38)' : 'rgb(59, 130, 246)',
                  }}
                >
                  {rule.constraintType}
                </span>
              </div>
            </div>

            {/* Target Role (if applicable) */}
            {rule.TargetRole && (
              <div>
                <div style={labelStyle}>Target Role</div>
                <div style={valueStyle}>
                  {rule.TargetRole.displayName}
                </div>
              </div>
            )}

            {/* Value (if applicable) */}
            {rule.valueInt !== null && rule.valueInt !== undefined && (
              <div>
                <div style={labelStyle}>Value</div>
                <div style={valueStyle}>{rule.valueInt}</div>
              </div>
            )}

            {/* Display Name */}
            {rule.displayName && (
              <div>
                <div style={labelStyle}>Display Name</div>
                <div style={valueStyle}>{rule.displayName}</div>
              </div>
            )}

            {/* Description */}
            {rule.description && (
              <div>
                <div style={labelStyle}>Description</div>
                <div style={valueStyle}>{rule.description}</div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        {rule.CrewRoleRules && rule.CrewRoleRules.length > 0 && (
          <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />
        )}

        {/* Assigned Crew Section */}
        {rule.CrewRoleRules && rule.CrewRoleRules.length > 0 && (
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
              Assigned Crew ({rule.CrewRoleRules.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {rule.CrewRoleRules.sort((a, b) => a.Crew.name.localeCompare(b.Crew.name)).map((crewRule) => (
                <div
                  key={crewRule.id}
                  className="ai-glass-border"
                  style={aiGlassLightBorderStyle('9999px')}
                >
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 400,
                      color: '#2C2C2C',
                    }}
                  >
                    {crewRule.Crew.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CardContainer>
  );
}
