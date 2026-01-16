'use client';

import { useState } from 'react';
import { CardContainer, CardSmall, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { ROLE_RULE_TYPE_LABELS } from '@/lib/role-rule-constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface StoreRulesSectionProps {
  storeId: string;
  storeRules: any[];
  onRefresh: () => void;
  onAdd?: () => void;
  onViewRule?: (ruleId: number) => void;
}

export function StoreRulesSection({ storeId, storeRules, onRefresh, onAdd, onViewRule }: StoreRulesSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [hoveredRule, setHoveredRule] = useState<number | null>(null);

  const handleDelete = async (ruleId: number) => {
    try {
      const res = await fetch(`${API_URL}/store-role-rules/${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh();
        setDeleteConfirm(null);
      }
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  // Extract unique RoleRules from StoreRoleRules, keeping track of StoreRoleRule id for deletion
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
  const groupedByType = new Map<string, any[]>();
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
            {/* Add button - rounded left, pill right */}
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
          </div>

          {/* Grouped list - card per type */}
          <div className="flex flex-col gap-4">
            {Array.from(groupedByType.entries()).map(([ruleType, roleRules]) => (
              <CardContainer key={ruleType} lightMode={true} borderRadius="1rem" padding="1rem" borderOpacity={0.15}>
                <div className="flex flex-col gap-3">
                  {/* Group header */}
                  <div style={{
                    padding: '6px 14px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                  }}>
                    {ROLE_RULE_TYPE_LABELS[ruleType] || ruleType}
                  </div>

                  {/* Items in group - cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(roleRules.length, 4)}, 1fr)`, gap: '8px' }}>
                    {roleRules.map(({ roleRule, storeRoleRuleId }) => (
                      <CardSmall
                        key={storeRoleRuleId}
                        lightMode={true}
                        contentStyle={{
                          padding: '12px',
                          cursor: 'pointer',
                          position: 'relative',
                          overflow: 'visible',
                        }}
                        onClick={() => onViewRule?.(roleRule.id)}
                      >
                        <div
                          onMouseEnter={() => setHoveredRule(storeRoleRuleId)}
                          onMouseLeave={() => setHoveredRule(null)}
                          style={{ position: 'relative' }}
                        >
                          <div className="flex items-center justify-center h-full">
                            {roleRule.TargetRole && ['CANNOT_BE_ASSIGNED_BEFORE', 'CANNOT_BE_ASSIGNED_AFTER', 'DISTRIBUTION_BETWEEN_ROLE_X'].includes(roleRule.type) ? (
                              // Two roles: "role vs. (target_role)" - only target in bubble
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
                              // Single role - just plain text
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

                          {/* Hover action - delete button on right */}
                          {hoveredRule === storeRoleRuleId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(storeRoleRuleId);
                              }}
                              style={{
                                position: 'absolute',
                                right: '0',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                backgroundColor: 'hsla(0, 84%, 60%, 0.85)',
                                border: 'none',
                                borderRadius: '9999px',
                                padding: '4px 10px',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '11px',
                                fontWeight: 500,
                                color: '#FFFFFF',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                zIndex: 10,
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </CardSmall>
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="ai-glass-border"
            style={{
              ...aiGlassLightBorderStyle('1.5rem'),
              maxWidth: '400px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('1.5rem', 0.95),
                padding: '24px',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '18px',
                  fontWeight: 500,
                  color: '#2C2C2C',
                  marginBottom: '12px',
                }}
              >
                Remove Store Rule?
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#6B6B6B',
                  marginBottom: '24px',
                }}
              >
                Are you sure you want to remove this rule from the store?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '8px 16px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 400,
                    color: '#2C2C2C',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  style={{
                    backgroundColor: 'hsla(0, 84%, 60%, 0.85)',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '8px 16px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
