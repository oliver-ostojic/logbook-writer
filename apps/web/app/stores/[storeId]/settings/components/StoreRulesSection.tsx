'use client';

import { useState } from 'react';
import { CardContainer, GlassPillButton, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { ROLE_RULE_TYPE_LABELS } from '@/lib/role-rule-constants';

interface StoreRulesSectionProps {
  storeRules: any[];
  onAdd?: () => void;
  onViewRule?: (ruleId: number) => void;
}

export function StoreRulesSection({ storeRules, onAdd, onViewRule }: StoreRulesSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Extract unique RoleRules from StoreRoleRules
  const roleRulesMap = new Map<number, { roleRule: any; storeRoleRuleId: number }>();
  storeRules.forEach(r => {
    const ruleData = r.RoleRule;
    if (ruleData && ruleData.constraintType === 'HARD') {
      roleRulesMap.set(ruleData.id, { roleRule: ruleData, storeRoleRuleId: r.id });
    }
  });
  const uniqueRoleRules = Array.from(roleRulesMap.values());

  // Filter by search query
  const filteredRoleRules = uniqueRoleRules.filter(({ roleRule }) => {
    const ruleType = roleRule.type;
    const displayName = roleRule.displayName;
    const roleName = roleRule.Role?.displayName;
    const targetRoleName = roleRule.TargetRole?.displayName;

    return (
      (displayName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (roleName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (targetRoleName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ruleType?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ROLE_RULE_TYPE_LABELS[ruleType]?.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Group by type
  const groupedByType = new Map<string, { roleRule: any; storeRoleRuleId: number }[]>();
  filteredRoleRules.forEach(({ roleRule, storeRoleRuleId }) => {
    const type = roleRule.type;
    if (!groupedByType.has(type)) {
      groupedByType.set(type, []);
    }
    groupedByType.get(type)!.push({ roleRule, storeRoleRuleId });
  });

  return (
    <>
      <CardContainer lightMode={true} borderRadius="1rem" padding="1rem" borderOpacity={0.15}>
        <div className="flex flex-col" style={{ minHeight: '400px' }}>
          {/* Search and Add bar - bento box style */}
          <div className="mb-4 flex gap-2" style={{ paddingTop: '4px' }}>
            {/* Search section - pill left, rounded right */}
            <div
              className="ai-glass-border flex-1 rounded-l-full rounded-r-md overflow-hidden"
              style={aiGlassLightBorderStyle('1rem')}
            >
              <div
                className="flex items-center rounded-l-full rounded-r-md"
                style={{
                  ...aiGlassLightContentStyle('1rem', 0.6),
                  padding: '0 14px',
                  height: '36px',
                }}
              >
                <MagnifyingGlassIcon style={{ width: 14, height: 14, color: '#6B6B6B', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="focus:outline-none focus:ring-0 flex-1"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#2C2C2C',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 400,
                    width: '100%',
                    marginLeft: '8px',
                  }}
                />
              </div>
            </div>
            {/* Add button - rounded left, pill right - only for CAPTAIN/ADMIN */}
            {onAdd && (
              <div
                className="ai-glass-border rounded-l-md rounded-r-full overflow-hidden"
                style={aiGlassLightBorderStyle('1rem')}
              >
                <button
                  onClick={onAdd}
                  className="transition-all duration-150"
                  style={{
                    ...aiGlassLightContentStyle('1rem', 0.6),
                    border: 'none',
                    borderRadius: 'inherit',
                    padding: '0 16px',
                    height: '36px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 400,
                    color: '#2C2C2C',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)'}
                >
                  + Add
                </button>
              </div>
            )}
          </div>

          {/* Grouped list - card per type */}
          <div className="flex flex-col gap-4">
            {Array.from(groupedByType.entries()).map(([ruleType, roleRules]) => (
              <CardContainer key={ruleType} lightMode={true} borderRadius="1rem" padding="1rem" borderOpacity={0.15}>
                <div className="flex flex-col gap-3">
                  {/* Group header - title bubble */}
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
                      {ruleType}
                    </div>
                  </div>

                  {/* Items in group - cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(roleRules.length, 4)}, 1fr)`, gap: '8px' }}>
                    {roleRules.map(({ roleRule, storeRoleRuleId }) => (
                      <GlassPillButton
                        key={storeRoleRuleId}
                        onClick={() => onViewRule?.(roleRule.id)}
                        padding="12px"
                        contentStyle={{ justifyContent: 'center' }}
                      >
                        <div className="flex items-center justify-center h-full">
                          {roleRule.TargetRole && ['CANNOT_BE_ASSIGNED_BEFORE', 'CANNOT_BE_ASSIGNED_AFTER', 'DISTRIBUTION_BETWEEN_ROLE_X'].includes(roleRule.type) ? (
                            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                              <span
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  color: '#2C2C2C',
                                  lineHeight: 1.2,
                                  textAlign: 'center',
                                }}
                              >
                                {roleRule.Role?.displayName || 'Unknown'}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '12px',
                                  fontWeight: 400,
                                  color: '#6B6B6B',
                                }}
                              >
                                vs.
                              </span>
                              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                <div
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.5),
                                    background: 'rgba(245, 245, 245, 0.7)',
                                    padding: '4px 12px',
                                    fontFamily: 'var(--font-open-sans)',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    color: '#2C2C2C',
                                  }}
                                >
                                  {roleRule.TargetRole?.displayName || 'Unknown'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#2C2C2C',
                                lineHeight: 1.2,
                                textAlign: 'center',
                              }}
                            >
                              {roleRule.Role?.displayName || 'Unknown'}
                            </span>
                          )}
                        </div>
                      </GlassPillButton>
                    ))}
                  </div>
                </div>
              </CardContainer>
            ))}

            {groupedByType.size === 0 && (
              <div className="flex items-center justify-center flex-1" style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', padding: '2rem 0' }}>
                No store rules found
              </div>
            )}
          </div>
        </div>
      </CardContainer>
    </>
  );
}
