'use client';

import { CardContainer, GlassPillButton, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { EmbeddedSearchHeader } from './EmbeddedSearchHeader';
import { DetailPanelContent } from './DetailPanelContent';
import { SelectedItem, EditableItem, ViewId } from '../types';

const ITEMS_PER_PAGE = 10;

interface RolesViewProps {
  rolesSearchQuery: string;
  setRolesSearchQuery: (q: string) => void;
  filteredRoles: { id: string; name: string; familyId: string | null }[];
  filteredRoleFamilies: { id: string; name: string }[];
  effectiveRoleFamilies: { id: string; name: string }[];
  dataLoaded: boolean;
  rolesPage: number;
  setRolesPage: (p: number | ((prev: number) => number)) => void;
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
}

export function RolesView({
  rolesSearchQuery,
  setRolesSearchQuery,
  filteredRoles,
  filteredRoleFamilies,
  effectiveRoleFamilies,
  dataLoaded,
  rolesPage,
  setRolesPage,
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
}: RolesViewProps) {
  const totalPages = Math.ceil(filteredRoles.length / ITEMS_PER_PAGE);
  const startIndex = (rolesPage - 1) * ITEMS_PER_PAGE;
  const paginatedRoles = filteredRoles.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (rolesPage > totalPages && totalPages > 0) setRolesPage(1);

  const hasDetailPanel = selectedItem?.type === 'roles' || selectedItem?.type === 'roleFamilies';
  const hasSearchData = effectiveRoleFamilies.length > 0 || filteredRoles.length > 0;

  const getFamilyName = (familyId: string | null): string => {
    if (!familyId) return 'Store role';
    const family = effectiveRoleFamilies.find(f => f.id === familyId);
    return family ? family.name : 'Store role';
  };

  return (
    <>
      {filteredRoleFamilies.length > 0 && (
        <div data-tutorial-id="role-families">
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
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
                    Role Families
                  </div>
                </div>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <button
                    onClick={() => setSelectedItem({ id: 'new', name: 'New Role Family', type: 'roleFamilies', mode: 'add' })}
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
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(filteredRoleFamilies.length, 4)}, 1fr)`, gap: '1rem' }}>
                {filteredRoleFamilies.map((family) => {
                  const isSelected = selectedItem?.id === family.id && selectedItem?.type === 'roleFamilies';
                  return (
                    <GlassPillButton
                      key={`family-${family.id}`}
                      isSelected={isSelected}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedItem(null);
                        } else {
                          setSelectedItem({ id: family.id, name: family.name, type: 'roleFamilies', mode: 'view' });
                        }
                      }}
                      style={{ width: '100%' }}
                    >
                      <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#2C2C2C', lineHeight: 1.2, textAlign: 'center' }}>
                        {family.name}
                      </span>
                    </GlassPillButton>
                  );
                })}
              </div>
            </div>
          </CardContainer>
        </div>
      )}

      <div className="flex gap-6" style={{ minHeight: '400px' }}>
        <div style={{ width: hasDetailPanel ? '40%' : '100%', transition: 'width 0.3s ease', minWidth: hasDetailPanel ? '200px' : undefined }}>
          <div data-tutorial-id="roles-list">
            <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
              <div className="flex flex-col" style={{ minHeight: '400px' }}>
                {hasSearchData && (
                  <EmbeddedSearchHeader
                    searchValue={rolesSearchQuery}
                    onSearchChange={setRolesSearchQuery}
                    currentPage={rolesPage}
                    totalPages={totalPages}
                    setPage={setRolesPage}
                    onAddClick={() => setSelectedItem({ id: '', name: 'New Role', type: 'roles', mode: 'add' })}
                  />
                )}
                <div className="flex flex-col gap-3 flex-1" style={{ marginTop: hasSearchData ? '16px' : 0 }}>
                  {paginatedRoles.length > 0 ? (
                    paginatedRoles.map((role) => {
                      const isSelected = selectedItem?.id === role.id && selectedItem?.type === 'roles';
                      return (
                        <GlassPillButton
                          key={`role-${role.id}`}
                          isSelected={isSelected}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedItem(null);
                            } else {
                              setSelectedItem({ id: role.id, name: role.name, type: 'roles', mode: 'view' });
                            }
                          }}
                          padding="12px 16px"
                          contentStyle={{ justifyContent: 'flex-start' }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#2C2C2C' }}>
                              {role.name}
                            </span>
                            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#6B6B6B' }}>
                              {getFamilyName(role.familyId)}
                            </span>
                          </div>
                        </GlassPillButton>
                      );
                    })
                  ) : dataLoaded ? (
                    <div className="flex items-center justify-center flex-1" style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B' }}>
                      No roles found
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContainer>
          </div>
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
    </>
  );
}
