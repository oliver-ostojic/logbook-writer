'use client';

import { CardContainer, GlassPillButton } from '@/components/ui/ai-glass';
import { EmbeddedSearchHeader } from './EmbeddedSearchHeader';
import { DetailPanelContent } from './DetailPanelContent';
import { SelectedItem, EditableItem, ViewId } from '../types';

const ITEMS_PER_PAGE = 10;

interface CrewViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filteredCrew: { id: string; name: string }[];
  dataLoaded: boolean;
  crewPage: number;
  setCrewPage: (p: number | ((prev: number) => number)) => void;
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

export function CrewView({
  searchQuery,
  setSearchQuery,
  filteredCrew,
  dataLoaded,
  crewPage,
  setCrewPage,
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
}: CrewViewProps) {
  const totalPages = Math.ceil(filteredCrew.length / ITEMS_PER_PAGE);
  const startIndex = (crewPage - 1) * ITEMS_PER_PAGE;
  const paginatedCrew = filteredCrew.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (crewPage > totalPages && totalPages > 0) setCrewPage(1);

  const hasDetailPanel = selectedItem?.type === 'crew';

  return (
    <div className="flex gap-6" style={{ minHeight: '400px' }}>
      <div style={{ width: hasDetailPanel ? '40%' : '100%', transition: 'width 0.3s ease', minWidth: hasDetailPanel ? '200px' : undefined }}>
        <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
          <div className="flex flex-col">
            <EmbeddedSearchHeader
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              currentPage={crewPage}
              totalPages={totalPages}
              setPage={setCrewPage}
              onAddClick={() => setSelectedItem({ id: '', name: 'New Crew Member', type: 'crew', mode: 'add' })}
              tutorialId="crew-header"
            />
            <div data-tutorial-id="crew-list" className="flex flex-col gap-3 flex-1" style={{ marginTop: '16px' }}>
              {paginatedCrew.length > 0 ? (
                paginatedCrew.map((item) => {
                  const isSelected = selectedItem?.id === item.id && selectedItem?.type === 'crew';
                  return (
                    <GlassPillButton
                      key={`crew-${item.id}`}
                      isSelected={isSelected}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedItem(null);
                        } else {
                          setSelectedItem({ id: item.id, name: item.name, type: 'crew', mode: 'view' });
                        }
                      }}
                      padding="12px 16px"
                      contentStyle={{ justifyContent: 'flex-start' }}
                    >
                      <div className="flex flex-col gap-2 w-full">
                        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#2C2C2C' }}>
                          {item.name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#6B6B6B' }}>
                          Crew member
                        </span>
                      </div>
                    </GlassPillButton>
                  );
                })
              ) : dataLoaded ? (
                <div className="flex items-center justify-center flex-1" style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B' }}>
                  No crew found
                </div>
              ) : null}
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
