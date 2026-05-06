'use client';

import { useState, useEffect, useRef } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard } from '@/components/ui/ai-glass';
import { RoleQuickLookCardGlass, RoleCardData } from './RoleQuickLookCard';
import { RoleDetailView } from './RoleDetailView';
import type { CrewFairnessRow } from './CrewFairnessTable';

const CARDS_PER_PAGE = 6;

interface RoleBoxPlotStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  hasDistribution: boolean;
}

interface RoleHeatmap {
  weeks: string[];
  data: { week: string; dayOfWeek: string; avgHours: number }[];
}

interface RoleListViewProps {
  roleCards: RoleCardData[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  page: number;
  setPage: (page: number | ((p: number) => number)) => void;
  panelCard: RoleCardData | null;
  setPanelCard: (card: RoleCardData | null) => void;
  availableDates: string[];
  selectedDates: string[];
  onSelectionChange: (dates: string[]) => void;
  roleBoxPlotLabel: string | null;
  setRoleBoxPlotLabel: (label: string | null) => void;
  computedRoleBoxPlot: RoleBoxPlotStats;
  computedRoleHeatmap: RoleHeatmap;
  computedCrewFairnessTable: CrewFairnessRow[];
  formatMinutesToReadable: (minutes: number) => string;
  sparklineData: number[];
}

export function RoleListView({
  roleCards,
  searchQuery,
  setSearchQuery,
  page,
  setPage,
  panelCard,
  setPanelCard,
  availableDates,
  selectedDates,
  onSelectionChange,
  roleBoxPlotLabel,
  setRoleBoxPlotLabel,
  computedRoleBoxPlot,
  computedRoleHeatmap,
  computedCrewFairnessTable,
  formatMinutesToReadable,
  sparklineData,
}: RoleListViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isCondensed, setIsCondensed] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const hasToggledRef = useRef(false);

  const filteredCards = roleCards.filter(card =>
    card.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.ceil(filteredCards.length / CARDS_PER_PAGE);
  const showPagination = filteredCards.length > CARDS_PER_PAGE;
  const hasPanel = panelCard !== null;

  useEffect(() => {
    if (!hasToggledRef.current) {
      hasToggledRef.current = true;
      return;
    }
    setIsHiding(true);
    const timer = setTimeout(() => {
      setIsCondensed(hasPanel);
      requestAnimationFrame(() => setIsHiding(false));
    }, 120);
    return () => clearTimeout(timer);
  }, [hasPanel]);

  return (
    <div
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
                  placeholder="Search roles..."
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
                  data-tutorial-id={card.name?.toLowerCase() === 'product' ? 'dashboard-role-product-card' : undefined}
                  className="ai-glass-border cursor-pointer"
                  style={{
                    ...aiGlassLightBorderStyle('1rem', '0, 0, 0', isSelected || isHovered ? 0 : 0.08),
                    filter: isSelected || isHovered ? 'brightness(0.94)' : undefined,
                    transform: isSelected || isHovered ? 'scale(1.01)' : undefined,
                    overflow: 'hidden',
                    transition: 'filter 0.2s ease, transform 0.2s ease',
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
                  <div style={{ opacity: isHiding ? 0 : 1, transition: 'opacity 0.12s ease' }}>
                    <RoleQuickLookCardGlass card={card} condensed={isCondensed} />
                  </div>
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
              No roles found
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
            <RoleDetailView
              role={panelCard}
              availableDates={availableDates}
              selectedDates={selectedDates}
              onSelectionChange={onSelectionChange}
              roleBoxPlotLabel={roleBoxPlotLabel}
              setRoleBoxPlotLabel={setRoleBoxPlotLabel}
              computedRoleBoxPlot={computedRoleBoxPlot}
              computedRoleHeatmap={computedRoleHeatmap}
              computedCrewFairnessTable={computedCrewFairnessTable}
              formatMinutesToReadable={formatMinutesToReadable}
              sparklineData={sparklineData}
            />
          )}
        </div>
      </div>
    </div>
  );
}
