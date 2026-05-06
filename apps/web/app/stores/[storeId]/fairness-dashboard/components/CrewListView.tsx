'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard } from '@/components/ui/ai-glass';
import { CrewQuickLookCardGlass, CrewCardData } from './CrewQuickLookCard';
import { CrewDetailView } from './CrewDetailView';

const CARDS_PER_PAGE = 7;

interface CrewListViewProps {
  crewCards: CrewCardData[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  page: number;
  setPage: (page: number | ((p: number) => number)) => void;
  panelCard: CrewCardData | null;
  setPanelCard: (card: CrewCardData | null) => void;
  availableDates: string[];
  selectedDates: string[];
  onSelectionChange: (dates: string[]) => void;
  crewLineGraphLabel: string | null;
  setCrewLineGraphActiveData: (data: { shiftDate?: string } | null) => void;
  setCrewLineGraphLabel: (label: string | null) => void;
  crewLineGraphSelectedIndex: number | undefined;
  setCrewLineGraphSelectedIndex: (index: number | undefined) => void;
  crewBoxPlotLabel: string | null;
  setCrewBoxPlotLabel: (label: string | null) => void;
  crewPreferencesLabel: string | null;
  setCrewPreferencesLabel: (label: string | null) => void;
  roleRules: Array<{ type: string; description?: string }>;
  formatRuleTypeLabel: (ruleType: string) => string;
}

export function CrewListView({
  crewCards,
  searchQuery,
  setSearchQuery,
  page,
  setPage,
  panelCard,
  setPanelCard,
  availableDates,
  selectedDates,
  onSelectionChange,
  crewLineGraphLabel,
  setCrewLineGraphActiveData,
  setCrewLineGraphLabel,
  crewLineGraphSelectedIndex,
  setCrewLineGraphSelectedIndex,
  crewBoxPlotLabel,
  setCrewBoxPlotLabel,
  crewPreferencesLabel,
  setCrewPreferencesLabel,
  roleRules,
  formatRuleTypeLabel,
}: CrewListViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredCards = crewCards
    .filter(card => (card.preferencesTotal ?? 0) > 0)
    .filter(card => card.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));
  const totalPages = Math.ceil(filteredCards.length / CARDS_PER_PAGE);
  const showPagination = filteredCards.length > CARDS_PER_PAGE;
  const hasPanel = panelCard !== null;

  return (
    <div
      data-tutorial-id="dashboard-crew-list-view"
      className="ai-glass-border"
      style={{
        ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08),
        background: `rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.6) * 1.0000))`,
        minHeight: '400px',
      }}
    >
      <div style={{ margin: '0', width: '100%' }}>
        <GlassPillCard padding="1rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
          <div className="flex items-center" style={{ width: '100%', gap: '12px' }}>
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flex: 1, minWidth: 0 }}>
              <div
                className="flex items-center"
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.6),
                  padding: '0 14px',
                  height: '36px',
                  width: '100%',
                }}
              >
                <MagnifyingGlassIcon style={{ width: 14, height: 14, color: '#6B6B6B', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search crew..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
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
            {showPagination && (
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
                <div
                  className="flex items-center gap-1"
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.4),
                    padding: '0 6px',
                    height: '36px',
                  }}
                >
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '0 8px',
                      cursor: page === 1 ? 'default' : 'pointer',
                      color: page === 1 ? '#9A999E' : '#6B6B6B',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                    }}
                  >
                    ◀
                  </button>
                  <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', padding: '0 4px' }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '0 8px',
                      cursor: page >= totalPages ? 'default' : 'pointer',
                      color: page >= totalPages ? '#9A999E' : '#6B6B6B',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                    }}
                  >
                    ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        </GlassPillCard>
      </div>

      <div className="flex" style={{ padding: '16px', gap: '16px' }}>
        <div
          data-tutorial-id="dashboard-crew-list-cards"
          className="flex flex-col gap-3"
          style={{
            width: hasPanel ? '20%' : '100%',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            flexShrink: 0,
          }}
        >
          {filteredCards
            .slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE)
            .map((card) => {
              const isSelected = panelCard?.id === card.id;
              const isHovered = hoveredId === card.id;
              return (
                <div
                  key={card.id}
                  className="ai-glass-border cursor-pointer transition-all"
                  style={{
                    ...aiGlassLightBorderStyle('1rem', '0, 0, 0', isSelected || isHovered ? 0 : 0.08),
                    filter: isSelected || isHovered ? 'brightness(0.94)' : undefined,
                    transform: isSelected || isHovered ? 'scale(1.01)' : undefined,
                  }}
                  onMouseEnter={() => setHoveredId(card.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    if (isSelected) {
                      setPanelCard(null);
                    } else {
                      setPanelCard(card);
                    }
                  }}
                >
                  <CrewQuickLookCardGlass card={card} condensed={hasPanel} />
                </div>
              );
            })}
          {filteredCards.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem',
                color: '#6B6B6B',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
              }}
            >
              No crew members found
            </div>
          )}
        </div>

        <div
          style={{
            width: hasPanel ? '80%' : '0%',
            overflow: 'hidden',
            borderRadius: '1.5rem',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {panelCard && (
            <div data-tutorial-id="dashboard-crew-detail-panel">
              <CrewDetailView
                crew={panelCard}
                availableDates={availableDates}
                selectedDates={selectedDates}
                onSelectionChange={onSelectionChange}
                crewLineGraphLabel={crewLineGraphLabel}
                setCrewLineGraphActiveData={setCrewLineGraphActiveData}
                setCrewLineGraphLabel={setCrewLineGraphLabel}
                crewLineGraphSelectedIndex={crewLineGraphSelectedIndex}
                setCrewLineGraphSelectedIndex={setCrewLineGraphSelectedIndex}
                crewBoxPlotLabel={crewBoxPlotLabel}
                setCrewBoxPlotLabel={setCrewBoxPlotLabel}
                crewPreferencesLabel={crewPreferencesLabel}
                setCrewPreferencesLabel={setCrewPreferencesLabel}
                roleRules={roleRules}
                formatRuleTypeLabel={formatRuleTypeLabel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
