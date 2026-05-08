'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api/authFetch';
import { CardContainer, GlassPillButton, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { EmbeddedSearchHeader } from './EmbeddedSearchHeader';
import { DetailPanelContent } from './DetailPanelContent';
import { formatLogbookDate } from '../utils';
import { SelectedItem, EditableItem, ViewId } from '../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const ITEMS_PER_PAGE = 10;

interface LogbooksViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filteredDateEntries: any[];
  dataLoaded: boolean;
  logbooksPage: number;
  setLogbooksPage: (p: number | ((prev: number) => number)) => void;
  logbooksDeleteMode: boolean;
  setLogbooksDeleteMode: (b: boolean) => void;
  logbooksSelectedIds: Set<string>;
  setLogbooksSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  logbooksDragRef: React.MutableRefObject<{ active: boolean; adding: boolean } | null>;
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
  tutorialIsActive: boolean;
}

export function LogbooksView({
  searchQuery,
  setSearchQuery,
  filteredDateEntries,
  dataLoaded,
  logbooksPage,
  setLogbooksPage,
  logbooksDeleteMode,
  setLogbooksDeleteMode,
  logbooksSelectedIds,
  setLogbooksSelectedIds,
  logbooksDragRef,
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
  tutorialIsActive,
}: LogbooksViewProps) {
  const router = useRouter();

  const totalPages = Math.ceil(filteredDateEntries.length / ITEMS_PER_PAGE);
  const startIndex = (logbooksPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = filteredDateEntries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (logbooksPage > totalPages && totalPages > 0) setLogbooksPage(1);

  const hasDetailPanel = selectedItem?.type === 'logbooks' || selectedItem?.type === 'runs';

  const extraControls = logbooksDeleteMode ? (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
        <button
          onClick={async () => {
            await Promise.all(
              Array.from(logbooksSelectedIds).map(id =>
                authFetch(`${API_URL}/schedule/logbook/${id}`, { method: 'DELETE' }).catch(() => {})
              )
            );
            refreshData();
            setLogbooksSelectedIds(new Set());
            setLogbooksDeleteMode(false);
            if (selectedItem && logbooksSelectedIds.has(selectedItem.id)) setSelectedItem(null);
          }}
          style={{ ...aiGlassLightContentStyle('9999px', 0.4), padding: '0 14px', height: '36px', fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: logbooksSelectedIds.size > 0 ? '#dc2626' : '#6B6B6B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          Confirm{logbooksSelectedIds.size > 0 ? ` (${logbooksSelectedIds.size})` : ''}
        </button>
      </div>
      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
        <button
          onClick={() => { setLogbooksSelectedIds(new Set()); setLogbooksDeleteMode(false); }}
          style={{ ...aiGlassLightContentStyle('9999px', 0.4), padding: '0 14px', height: '36px', fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#6B6B6B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
      <button
        onClick={() => setLogbooksDeleteMode(true)}
        style={{ ...aiGlassLightContentStyle('9999px', 0.4), padding: '0 14px', height: '36px', fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#6B6B6B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        Delete
      </button>
    </div>
  );

  return (
    <div className="flex gap-6" style={{ minHeight: '400px' }}>
      <div style={{ width: hasDetailPanel ? '40%' : '100%', transition: 'width 0.3s ease', minWidth: hasDetailPanel ? '200px' : undefined }}>
        <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
          <div className="flex flex-col">
            <EmbeddedSearchHeader
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              currentPage={logbooksPage}
              totalPages={totalPages}
              setPage={setLogbooksPage}
              onAddClick={() => {
                const dateParam = tutorialIsActive ? '?date=2026-05-10' : '';
                router.push(`/stores/${storeId}/logbook/create/shifts${dateParam}`);
              }}
              tutorialId="logbooks-header"
              addBtnTutorialId="logbooks-add-btn"
              extraControls={extraControls}
            />

            <div data-tutorial-id="logbooks-list" className="flex flex-col gap-3 flex-1" style={{ marginTop: '16px' }}>
              {paginatedData.length > 0 ? (
                paginatedData.map((item, itemIndex) => {
                  const itemName = formatLogbookDate(item.date);
                  const isSelected = selectedItem?.id === item.id && selectedItem?.type === 'logbooks';
                  const isMarkedForDelete = logbooksDeleteMode && logbooksSelectedIds.has(item.id);
                  const inDeleteMode = logbooksDeleteMode;

                  const divider = <div style={{ width: 1, height: 16, flexShrink: 0, background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.12) 30%, rgba(0,0,0,0.12) 70%, transparent 100%)' }} />;
                  const getPrefColor = (pct: number) => {
                    if (pct < 60) return '#dc2626';
                    if (pct < 70) return '#d97706';
                    if (pct < 80) return '#16a34a';
                    return '#2563eb';
                  };

                  const latestRun = !item.hasLogbook ? item.runs?.[0] : null;
                  const runCount = !item.hasLogbook ? (item.runs?.length ?? 0) : 0;
                  const statusColor = latestRun?.status === 'OPTIMAL' ? '#10b981' :
                    latestRun?.status === 'FEASIBLE' ? '#3b82f6' :
                    latestRun?.status === 'TIME_LIMIT' ? '#f59e0b' :
                    latestRun?.status === 'INFEASIBLE' ? '#ef4444' : '#9A999E';

                  const fullContent = !item.hasLogbook ? (
                    <div className="flex items-center w-full gap-3">
                      <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#2C2C2C', flexShrink: 0 }}>{itemName}</span>
                      {divider}
                      <div className="flex items-center flex-1 gap-2">
                        <div className="flex items-center justify-between flex-1">
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E', fontWeight: 400 }}>Runs</span>
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C', fontWeight: 500 }}>{runCount}</span>
                        </div>
                        {divider}
                        <div className="flex-1" />
                        {divider}
                        <div className="flex items-center justify-between flex-1">
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E', fontWeight: 400 }}>Status</span>
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '11px', color: statusColor, fontWeight: 600 }}>{latestRun?.status ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center w-full gap-3">
                      <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#2C2C2C', flexShrink: 0 }}>{itemName}</span>
                      {divider}
                      <div className="flex items-center flex-1 gap-2">
                        <div className="flex items-center justify-between flex-1">
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E', fontWeight: 400 }}>Violations</span>
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C', fontWeight: 500 }}>{item.violationCount ?? '—'}</span>
                        </div>
                        {divider}
                        <div className="flex items-center justify-between flex-1">
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E', fontWeight: 400 }}>Crew</span>
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C', fontWeight: 500 }}>{item.crewCount != null ? item.crewCount : '—'}</span>
                        </div>
                        {divider}
                        <div className="flex items-center justify-between flex-1">
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E', fontWeight: 400 }}>Prefs</span>
                          <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: item.prefsMet != null ? getPrefColor(item.prefsMet) : '#2C2C2C', fontWeight: 500 }}>
                            {item.prefsMet != null ? `${Math.round(item.prefsMet)}%` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );

                  const condensedContent = (
                    <div className="flex items-center justify-between w-full">
                      <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#2C2C2C' }}>{itemName}</span>
                      {item.hasLogbook && item.prefsMet != null ? (
                        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: getPrefColor(item.prefsMet), fontWeight: 500 }}>
                          {Math.round(item.prefsMet)}%
                        </span>
                      ) : !item.hasLogbook && latestRun ? (
                        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '11px', color: statusColor, fontWeight: 600 }}>
                          {latestRun.status}
                        </span>
                      ) : null}
                    </div>
                  );

                  return (
                    <div
                      key={`logbooks-${item.id}`}
                      style={{ touchAction: inDeleteMode ? 'none' : undefined, userSelect: 'none' }}
                      onPointerDown={inDeleteMode ? (e) => {
                        e.preventDefault();
                        const adding = !logbooksSelectedIds.has(item.id);
                        logbooksDragRef.current = { active: true, adding };
                        setLogbooksSelectedIds(prev => {
                          const next = new Set(prev);
                          if (adding) next.add(item.id); else next.delete(item.id);
                          return next;
                        });
                      } : undefined}
                      onPointerEnter={inDeleteMode ? () => {
                        if (!logbooksDragRef.current?.active) return;
                        const { adding } = logbooksDragRef.current;
                        setLogbooksSelectedIds(prev => {
                          const next = new Set(prev);
                          if (adding) next.add(item.id); else next.delete(item.id);
                          return next;
                        });
                      } : undefined}
                      onPointerUp={inDeleteMode ? () => { logbooksDragRef.current = null; } : undefined}
                    >
                      <GlassPillButton
                        isSelected={isMarkedForDelete ? false : isSelected}
                        className={inDeleteMode ? 'ios-wiggle' : ''}
                        style={isMarkedForDelete ? { background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', animationDelay: `${(itemIndex * 0.04) % 0.32}s` } : inDeleteMode ? { animationDelay: `${(itemIndex * 0.04) % 0.32}s` } : undefined}
                        onClick={inDeleteMode ? () => {} : () => {
                          if (isSelected) {
                            setSelectedItem(null);
                          } else if (item.hasLogbook) {
                            setSelectedItem({ id: item.id, name: itemName, type: 'logbooks', mode: 'history', dateKey: item.dateKey });
                          } else {
                            setSelectedItem({ id: item.id, name: itemName, type: 'logbooks', mode: 'runsOnly', dateKey: item.dateKey });
                          }
                        }}
                        padding="12px 16px"
                        contentStyle={{ justifyContent: 'flex-start' }}
                      >
                        {hasDetailPanel ? condensedContent : fullContent}
                      </GlassPillButton>
                    </div>
                  );
                })
              ) : dataLoaded ? (
                <div className="flex items-center justify-center flex-1" style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B' }}>
                  No logbooks found
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
