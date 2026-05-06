'use client';

import { CardContainer, GlassPillButton, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { EmbeddedSearchHeader } from './EmbeddedSearchHeader';
import { DetailPanelContent } from './DetailPanelContent';
import { ROLE_RULE_TYPE_LABELS } from '@/lib/role-rule-constants';
import { SelectedItem, EditableItem, ViewId } from '../types';

interface PreferencesViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  apiPreferences: any[];
  dataLoaded: boolean;
  preferencesPage: number;
  setPreferencesPage: (p: number | ((prev: number) => number)) => void;
  selectedItem: SelectedItem | null;
  setSelectedItem: (item: SelectedItem | null) => void;
  previousView: SelectedItem | null;
  setPreviousView: (item: SelectedItem | null) => void;
  setActiveView: (view: ViewId) => void;
  storeId: string;
  refreshData: () => void;
  setDeleteConfirmItem: (item: EditableItem | null) => void;
  apiRuns: any[];
  apiStore: any;
  effectiveRoleFamilies: { id: string; name: string }[];
}

export function PreferencesView({
  searchQuery,
  setSearchQuery,
  apiPreferences,
  dataLoaded,
  preferencesPage,
  setPreferencesPage,
  selectedItem,
  setSelectedItem,
  previousView,
  setPreviousView,
  setActiveView,
  storeId,
  refreshData,
  setDeleteConfirmItem,
  apiRuns,
  apiStore,
  effectiveRoleFamilies,
}: PreferencesViewProps) {
  const roleRulesMap = new Map<number, any>();
  apiPreferences.forEach(r => {
    if (r && r.constraintType === 'SOFT') roleRulesMap.set(r.id, r);
  });
  const uniqueRoleRules = Array.from(roleRulesMap.values());

  const filteredRoleRules = uniqueRoleRules.filter(rule => {
    const ruleType = rule.type;
    const displayName = rule.displayName;
    const roleName = rule.Role?.displayName;
    const targetRoleName = rule.TargetRole?.displayName;
    return (
      (displayName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (roleName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (targetRoleName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ruleType?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ROLE_RULE_TYPE_LABELS[ruleType]?.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  const groupedByType = new Map<string, any[]>();
  filteredRoleRules.forEach(rule => {
    if (!groupedByType.has(rule.type)) groupedByType.set(rule.type, []);
    groupedByType.get(rule.type)!.push(rule);
  });

  const hasSearchData = apiPreferences.length > 0;
  const hasDetailPanel = selectedItem?.type === 'preferences';

  return (
    <div className="flex gap-6" style={{ minHeight: '400px' }}>
      <div style={{ width: hasDetailPanel ? '40%' : '100%', transition: 'width 0.3s ease', minWidth: hasDetailPanel ? '200px' : undefined }}>
        <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
          <div className="flex flex-col" style={{ minHeight: '400px' }}>
            {hasSearchData && (
              <EmbeddedSearchHeader
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                currentPage={1}
                totalPages={1}
                setPage={setPreferencesPage}
                onAddClick={() => setSelectedItem({ id: '', name: 'New Preference', type: 'preferences', mode: 'add' })}
              />
            )}
            <div className="flex flex-col gap-4" style={{ marginTop: hasSearchData ? '16px' : 0 }}>
              {Array.from(groupedByType.entries()).map(([ruleType, roleRules]) => (
                <CardContainer key={ruleType} lightMode={true} borderRadius="1rem" padding="1rem">
                  <div className="flex flex-col gap-3">
                    <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                      <div
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.6),
                          padding: '6px 14px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#2C2C2C',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {ruleType}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(roleRules.length, 4)}, 1fr)`, gap: '8px' }}>
                      {roleRules.map((rule) => {
                        const typeDisplayName = ROLE_RULE_TYPE_LABELS[rule.type] || rule.type;
                        const isSelected = selectedItem?.id === String(rule.id) && selectedItem?.type === 'preferences';
                        return (
                          <GlassPillButton
                            key={rule.id}
                            isSelected={isSelected}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedItem(null);
                              } else {
                                setSelectedItem({ id: String(rule.id), name: typeDisplayName, type: 'preferences', mode: 'view' });
                              }
                            }}
                            padding="12px"
                            contentStyle={{ justifyContent: 'center' }}
                          >
                            <div className="flex items-center justify-center h-full">
                              {rule.TargetRole ? (
                                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                                  <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#2C2C2C', lineHeight: 1.2, textAlign: 'center' }}>
                                    {rule.Role?.displayName || 'Unknown'}
                                  </span>
                                  <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', fontWeight: 400, color: '#6B6B6B' }}>
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
                                      {rule.TargetRole?.displayName || 'Unknown'}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#2C2C2C', lineHeight: 1.2, textAlign: 'center' }}>
                                  {rule.Role?.displayName || rule.displayName || 'Unknown'}
                                </span>
                              )}
                            </div>
                          </GlassPillButton>
                        );
                      })}
                    </div>
                  </div>
                </CardContainer>
              ))}

              {groupedByType.size === 0 && dataLoaded && (
                <div className="flex items-center justify-center flex-1" style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', padding: '2rem 0' }}>
                  No preferences found
                </div>
              )}
            </div>
          </div>
        </CardContainer>
      </div>

      {hasDetailPanel && selectedItem && (
        <div style={{ width: '60%', transition: 'width 0.3s ease' }}>
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
            <DetailPanelContent
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              setActiveView={setActiveView}
              setPreviousView={setPreviousView}
              previousView={previousView}
              apiRuns={apiRuns}
              apiStore={apiStore}
              storeId={storeId}
              refreshData={refreshData}
              setDeleteConfirmItem={setDeleteConfirmItem}
              effectiveRoleFamilies={effectiveRoleFamilies}
            />
          </CardContainer>
        </div>
      )}
    </div>
  );
}
