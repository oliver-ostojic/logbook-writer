'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard } from '@/components/ui/ai-glass';

interface EmbeddedSearchHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  currentPage: number;
  totalPages: number;
  setPage: (page: number | ((p: number) => number)) => void;
  onAddClick: () => void;
  tutorialId?: string;
  addBtnTutorialId?: string;
  extraControls?: React.ReactNode;
}

export function EmbeddedSearchHeader({
  searchValue,
  onSearchChange,
  currentPage,
  totalPages,
  setPage,
  onAddClick,
  tutorialId,
  addBtnTutorialId,
  extraControls,
}: EmbeddedSearchHeaderProps) {
  const showPagination = totalPages > 1;

  return (
    <div data-tutorial-id={tutorialId} style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
      <GlassPillCard padding="1rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
        <div className="flex items-center" style={{ width: '100%', gap: '12px' }}>
          <div data-tutorial-id={addBtnTutorialId} className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
            <button
              onClick={onAddClick}
              style={{
                ...aiGlassLightContentStyle('9999px', 0.4),
                padding: '0 14px',
                height: '36px',
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
                placeholder="Search"
                value={searchValue}
                onChange={(e) => {
                  onSearchChange(e.target.value);
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
                  disabled={currentPage === 1}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0 8px',
                    cursor: currentPage === 1 ? 'default' : 'pointer',
                    color: currentPage === 1 ? '#9A999E' : '#6B6B6B',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                  }}
                >
                  ◀
                </button>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', padding: '0 4px' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0 8px',
                    cursor: currentPage >= totalPages ? 'default' : 'pointer',
                    color: currentPage >= totalPages ? '#9A999E' : '#6B6B6B',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                  }}
                >
                  ▶
                </button>
              </div>
            </div>
          )}

          {extraControls}
        </div>
      </GlassPillCard>
    </div>
  );
}
