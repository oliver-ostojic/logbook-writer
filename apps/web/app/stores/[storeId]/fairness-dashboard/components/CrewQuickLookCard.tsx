'use client';

import React, { useState, useRef, useEffect } from 'react';
import { aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface SatisfactionByDate {
  date: string;
  satisfactionPct: number;
}

interface RoleMinutes {
  roleId: string;
  roleName: string;
  avgMinutes: number;
}

interface PreferenceRuleBreakdown {
  ruleType: string;
  total: number;
  met: number;
  percentMet: number;
}

interface CardData {
  id: string;
  title: string;
  content?: React.ReactNode;
  satisfactionHistory?: number[];  // 10-day lookback satisfaction scores (0-100) - DEPRECATED, use satisfactionByDate
  // New fields from dashboard builder
  satisfactionScore?: number;      // Average satisfaction percentage (0-100)
  vsCrewAvg?: number;              // Delta from crew average (percentage points, can be negative)
  preferencesTotal?: number;       // Total crew role rules count
  preferencesMetCount?: number;    // Total preferences met across selection
  satisfactionRank?: number;       // Rank by satisfaction (1 = highest, supports ties)
  totalRankedCrew?: number;        // Total crew in the ranking (for x/total format)
  satisfactionByDate?: SatisfactionByDate[];  // For sparkline graph with dates
  avgMinutesPerRole?: RoleMinutes[];  // For bar chart: avg minutes per role per shift
  preferenceBreakdownByRuleType?: PreferenceRuleBreakdown[];  // For preferences met graph
}

interface CrewQuickLookCarouselProps {
  cards?: CardData[];
  children?: React.ReactNode;
  onNavigationChange?: (canGoUp: boolean, canGoDown: boolean, goUp: () => void, goDown: () => void, totalCount: number, currentIndex: number) => void;
  renderButtons?: boolean;
  onCardClick?: (card: CardData) => void;
}

export function CrewQuickLookCarousel({ cards = [], children, onNavigationChange, renderButtons = true, onCardClick }: CrewQuickLookCarouselProps) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const [targetPosition, setTargetPosition] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [measuredCardHeight, setMeasuredCardHeight] = useState(120);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(scrollPosition);
  const targetPositionRef = useRef(0);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    scrollPositionRef.current = scrollPosition;
  }, [scrollPosition]);

  const defaultCards: CardData[] = [
    { id: '1', title: 'Alice Johnson', satisfactionScore: 85, vsCrewAvg: 10, preferencesTotal: 8, satisfactionRank: 2, totalRankedCrew: 9, satisfactionHistory: [72, 75, 68, 80, 85, 78, 82, 79, 88, 85] },
    { id: '2', title: 'Bob Smith', satisfactionScore: 72, vsCrewAvg: -3, preferencesTotal: 6, satisfactionRank: 5, totalRankedCrew: 9, satisfactionHistory: [65, 62, 70, 68, 72, 75, 71, 74, 76, 78] },
    { id: '3', title: 'Carol Williams', satisfactionScore: 89, vsCrewAvg: 14, preferencesTotal: 10, satisfactionRank: 1, totalRankedCrew: 9, satisfactionHistory: [88, 85, 90, 87, 82, 85, 88, 91, 89, 92] },
    { id: '4', title: 'David Brown', satisfactionScore: 65, vsCrewAvg: -10, preferencesTotal: 5, satisfactionRank: 8, totalRankedCrew: 9, satisfactionHistory: [55, 60, 58, 65, 62, 68, 70, 65, 72, 71] },
    { id: '5', title: 'Emma Davis', satisfactionScore: 82, vsCrewAvg: 7, preferencesTotal: 7, satisfactionRank: 3, totalRankedCrew: 9, satisfactionHistory: [78, 82, 80, 76, 79, 83, 85, 88, 84, 87] },
    { id: '6', title: 'Frank Miller', satisfactionScore: 77, vsCrewAvg: 2, preferencesTotal: 9, satisfactionRank: 4, totalRankedCrew: 9, satisfactionHistory: [68, 70, 72, 75, 73, 78, 80, 82, 85, 83] },
    { id: '7', title: 'Grace Lee', satisfactionScore: 92, vsCrewAvg: 17, preferencesTotal: 12, satisfactionRank: 1, totalRankedCrew: 9, satisfactionHistory: [90, 88, 92, 89, 91, 93, 90, 94, 92, 95] },
    { id: '8', title: 'Henry Wilson', satisfactionScore: 66, vsCrewAvg: -9, preferencesTotal: 4, satisfactionRank: 7, totalRankedCrew: 9, satisfactionHistory: [62, 58, 65, 60, 63, 67, 70, 68, 72, 74] },
    { id: '9', title: 'Ivy Chen', satisfactionScore: 81, vsCrewAvg: 6, preferencesTotal: 8, satisfactionRank: 4, totalRankedCrew: 9, satisfactionHistory: [75, 78, 76, 80, 82, 79, 84, 86, 83, 88] },
  ];

  const allCards = cards.length > 0 ? cards : defaultCards;
  const visibleStackCount = 3;
  const stackOffset = 16;

  const animateToTarget = () => {
    const current = scrollPositionRef.current;
    const target = targetPositionRef.current;
    const diff = target - current;

    if (Math.abs(diff) < 0.01) {
      setScrollPosition(target);
      isAnimatingRef.current = false;
      return;
    }

    const newPosition = current + diff * 0.12;
    setScrollPosition(newPosition);
    requestAnimationFrame(animateToTarget);
  };

  const goUp = () => {
    if (targetPositionRef.current > 0) {
      const newTarget = Math.max(targetPositionRef.current - 1, 0);
      targetPositionRef.current = newTarget;
      setTargetPosition(newTarget);
      if (!isAnimatingRef.current) {
        isAnimatingRef.current = true;
        requestAnimationFrame(animateToTarget);
      }
    }
  };

  const goDown = () => {
    if (targetPositionRef.current < allCards.length - 1) {
      const newTarget = Math.min(targetPositionRef.current + 1, allCards.length - 1);
      targetPositionRef.current = newTarget;
      setTargetPosition(newTarget);
      if (!isAnimatingRef.current) {
        isAnimatingRef.current = true;
        requestAnimationFrame(animateToTarget);
      }
    }
  };

  const getVisibleCards = () => {
    const visibleCards: Array<CardData & { relativePosition: number; actualIndex: number }> = [];
    // Use both floor and ceil to catch cards during transitions
    const floorPos = Math.floor(scrollPosition);
    const ceilPos = Math.ceil(scrollPosition);
    const startIdx = Math.max(0, Math.min(floorPos, ceilPos) - 2);
    const endIdx = Math.min(allCards.length - 1, Math.max(floorPos, ceilPos) + 2);

    for (let i = startIdx; i <= endIdx; i++) {
      const relativePosition = i - scrollPosition;
      if (Math.abs(relativePosition) <= 2.5) {
        visibleCards.push({
          ...allCards[i],
          relativePosition,
          actualIndex: i,
        });
      }
    }
    return visibleCards;
  };

  const visibleCards = getVisibleCards();
  const maxCardsAbove = 2;
  const maxCardsBehind = visibleStackCount - 1;
  const reservedTopSpace = maxCardsAbove * stackOffset;
  const reservedBottomSpace = maxCardsBehind * stackOffset;
  const baseCardHeight = Math.max(120, measuredCardHeight); // use measured height or minimum
  const totalHeight = baseCardHeight + reservedTopSpace + reservedBottomSpace;

  // Measure main card height on resize
  useEffect(() => {
    const measureHeight = () => {
      if (mainCardRef.current) {
        const height = mainCardRef.current.offsetHeight;
        if (height > 0) {
          setMeasuredCardHeight(height);
        }
      }
    };
    
    measureHeight();
    window.addEventListener('resize', measureHeight);
    return () => window.removeEventListener('resize', measureHeight);
  }, []);

  // Use targetPosition (state) for immediate disabled state - no lag
  const canGoUp = targetPosition > 0;
  const canGoDown = targetPosition < allCards.length - 1;

  // Notify parent of navigation state changes
  useEffect(() => {
    if (onNavigationChange) {
      onNavigationChange(canGoUp, canGoDown, goUp, goDown, allCards.length, targetPosition);
    }
  }, [canGoUp, canGoDown, onNavigationChange, allCards.length, targetPosition]);

  return (
    <div className={renderButtons ? "flex items-center gap-4" : ""}>
      {/* Arrow buttons on the left - only render if renderButtons is true */}
      {renderButtons && (
        <div className="flex flex-col gap-2">
          <button
            onClick={goUp}
            disabled={!canGoUp}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 circle-button-glass-border"
            style={{
              background: canGoUp ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: canGoUp ? '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)' : 'none',
              cursor: canGoUp ? 'pointer' : 'default',
              opacity: canGoUp ? 1 : 0.3,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#DBDADB"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            onClick={goDown}
            disabled={!canGoDown}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 circle-button-glass-border"
            style={{
              background: canGoDown ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: canGoDown ? '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)' : 'none',
              cursor: canGoDown ? 'pointer' : 'default',
              opacity: canGoDown ? 1 : 0.3,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#DBDADB"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}

      {/* Card stack */}
      <div
        className={renderButtons ? "relative flex-1" : "relative w-full"}
        style={{ minHeight: totalHeight }}
      >
        {visibleCards.map((card) => {
          const { relativePosition } = card;
          const offsetY = reservedTopSpace + relativePosition * stackOffset;
          const distance = Math.abs(relativePosition);
          const scale = 1 - (distance * 0.02);
          const opacity = 1;  // Full opacity since we're using color fade instead
          const zIndex = 10 - Math.round(distance);
          const isMain = Math.abs(relativePosition) < 0.5;

          // Smooth color calculation based on continuous distance
          // All cards fade from bright (distance=0) to dark (distance=2)
          // This makes the scroll animation smooth as colors transition continuously
          const getCardColor = () => {
            // Main card colors (distance = 0) - Updated to match Month/Year cards
            const mainR = 39, mainG = 38, mainB = 41;  // #272629
            const hoverR = 50, hoverG = 49, hoverB = 55;  // Slightly lighter for hover
            
            // Darkest stacked color (distance = 2) - Updated to match Month/Year cards
            const darkR = 28, darkG = 27, darkB = 31;  // #1C1B1F
            
            // Clamp distance to 0-2 range for color calculation
            const colorFade = Math.min(distance, 2) / 2;  // 0 to 1
            
            // If it's the main card and hovered, use hover color as base
            const baseR = (isMain && isHovered) ? hoverR : mainR;
            const baseG = (isMain && isHovered) ? hoverG : mainG;
            const baseB = (isMain && isHovered) ? hoverB : mainB;
            
            // Interpolate from base color to dark color based on distance
            const r = Math.round(baseR - (baseR - darkR) * colorFade);
            const g = Math.round(baseG - (baseG - darkG) * colorFade);
            const b = Math.round(baseB - (baseB - darkB) * colorFade);
            
            return `rgb(${r}, ${g}, ${b})`;
          };

          return (
            <div
              key={card.id}
              ref={isMain ? mainCardRef : undefined}
              className="absolute w-full ai-glass-border"
              style={{
                borderRadius: '1rem',
                minHeight: 120,
                overflow: 'visible',
                background: getCardColor(),
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: isMain ? '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
                cursor: isMain ? 'pointer' : 'default',
                transform: `translateY(${offsetY}px) scale(${scale})`,
                transformOrigin: 'top center',
                opacity,
                zIndex,
              }}
              onMouseEnter={() => isMain && setIsHovered(true)}
              onMouseLeave={() => isMain && setIsHovered(false)}
              onClick={() => isMain && onCardClick?.(allCards[card.actualIndex])}
            >
              {/* Only show content on main card to prevent peeking/blinking on stacked cards */}
              <div
                className="p-4 flex flex-col gap-4"
                style={{
                  opacity: isMain ? 1 : 0,
                  pointerEvents: isMain ? 'auto' : 'none',
                  borderRadius: '1rem',
                  overflow: 'hidden',
                }}
              >
                {/* Crew name - top */}
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#DBDADB',
                    fontWeight: 350,
                    fontSize: 14,
                  }}
                >
                  {card.title}
                </span>

              {/* Stats and graph - responsive flex layout */}
              <div
                className="flex flex-wrap items-center gap-3"
              >
                {/* Column 1 - min width for wrapping */}
                <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 120 }}>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[13px]"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#7C7F82',
                        fontWeight: 350,
                      }}
                    >
                      Satisfaction
                    </span>
                    <span
                      className="text-[13px] text-right"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#DBDADB',
                        fontWeight: 350,
                      }}
                    >
                      {card.satisfactionScore !== undefined ? `${Math.round(card.satisfactionScore)}%` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[13px]"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#7C7F82',
                        fontWeight: 350,
                      }}
                    >
                      Vs crew
                    </span>
                    <span
                      className="text-[13px] text-right"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: card.vsCrewAvg === undefined ? '#7C7F82' : (card.vsCrewAvg >= 0 ? '#4ADE80' : '#F87171'),
                        fontWeight: 350,
                      }}
                    >
                      {card.vsCrewAvg !== undefined ? `${card.vsCrewAvg >= 0 ? '+' : ''}${Math.round(card.vsCrewAvg)}%` : '—'}
                    </span>
                  </div>
                </div>

                {/* Divider 1 - hidden on wrap */}
                <div
                  className="hidden sm:block"
                  style={{
                    width: 1,
                    height: 48,
                    background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
                  }}
                />

                {/* Column 2 - min width for wrapping */}
                <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 120 }}>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[13px]"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#7C7F82',
                        fontWeight: 350,
                      }}
                    >
                      Preferences
                    </span>
                    <span
                      className="text-[13px] text-right"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#DBDADB',
                        fontWeight: 350,
                      }}
                    >
                      {card.preferencesTotal ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[13px]"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#7C7F82',
                        fontWeight: 350,
                      }}
                    >
                      Satisfaction rank
                    </span>
                    <span
                      className="text-[13px] text-right"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#DBDADB',
                        fontWeight: 350,
                      }}
                    >
                      {card.satisfactionRank !== undefined && card.totalRankedCrew !== undefined
                        ? `${card.satisfactionRank}/${card.totalRankedCrew}`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Divider 2 - hidden on wrap */}
                <div
                  className="hidden sm:block"
                  style={{
                    width: 1,
                    height: 48,
                    background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
                  }}
                />

                {/* Graph - flexible width with minimum */}
                <div className="flex items-start justify-center flex-shrink-0" style={{ width: 100 }}>
                  {(() => {
                    const data = card.satisfactionHistory || [70, 72, 75, 73, 78, 80, 77, 82, 85, 83];
                    const width = 100;
                    const height = 50;
                    const padding = 4;
                    
                    // Calculate min/max for scaling (with some padding)
                    const minVal = Math.min(...data) - 5;
                    const maxVal = Math.max(...data) + 5;
                    const range = maxVal - minVal;
                    
                    // Generate points for the line
                    const points = data.map((val, i) => {
                      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
                      const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
                      return `${x},${y}`;
                    }).join(' ');
                    
                    // Generate area path (line + bottom fill)
                    const areaPath = data.map((val, i) => {
                      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
                      const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ') + ` L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
                    
                    // Determine trend color based on first vs last value
                    const trend = data[data.length - 1] - data[0];
                    const lineColor = trend >= 0 ? '#4ADE80' : '#F87171';  // green if up, red if down
                    const gradientId = `sparkGradient-${card.id}`;
                    
                    return (
                      <svg width={width} height={height} style={{ overflow: 'visible' }}>
                        <defs>
                          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {/* Area fill */}
                        <path
                          d={areaPath}
                          fill={`url(#${gradientId})`}
                        />
                        {/* Line */}
                        <polyline
                          points={points}
                          fill="none"
                          stroke={lineColor}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* End dot */}
                        <circle
                          cx={width - padding}
                          cy={height - padding - ((data[data.length - 1] - minVal) / range) * (height - padding * 2)}
                          r="2.5"
                          fill={lineColor}
                        />
                      </svg>
                    );
                  })()}
                </div>
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CrewQuickLookCard({ children }: { children?: React.ReactNode }) {
  const [isCardHovered, setIsCardHovered] = useState(false);

  return (
    <div
      className="relative w-full"
      style={{
        borderRadius: '1rem',
        minHeight: 120,
        overflow: 'hidden',
        // Use solid pre-calculated colors matching the carousel cards
        background: isCardHovered
          ? '#2A292E'
          : '#1E1D22',
        transition: 'background 0.2s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {children}
    </div>
  );
}

// Export default cards data for use in expanded view
export const defaultCrewCards: CardData[] = [
  { id: '1', title: 'Alice Johnson', satisfactionScore: 85, vsCrewAvg: 10, preferencesTotal: 8, satisfactionRank: 2, totalRankedCrew: 9, satisfactionHistory: [72, 75, 68, 80, 85, 78, 82, 79, 88, 85] },
  { id: '2', title: 'Bob Smith', satisfactionScore: 72, vsCrewAvg: -3, preferencesTotal: 6, satisfactionRank: 5, totalRankedCrew: 9, satisfactionHistory: [65, 62, 70, 68, 72, 75, 71, 74, 76, 78] },
  { id: '3', title: 'Carol Williams', satisfactionScore: 89, vsCrewAvg: 14, preferencesTotal: 10, satisfactionRank: 1, totalRankedCrew: 9, satisfactionHistory: [88, 85, 90, 87, 82, 85, 88, 91, 89, 92] },
  { id: '4', title: 'David Brown', satisfactionScore: 65, vsCrewAvg: -10, preferencesTotal: 5, satisfactionRank: 8, totalRankedCrew: 9, satisfactionHistory: [55, 60, 58, 65, 62, 68, 70, 65, 72, 71] },
  { id: '5', title: 'Emma Davis', satisfactionScore: 82, vsCrewAvg: 7, preferencesTotal: 7, satisfactionRank: 3, totalRankedCrew: 9, satisfactionHistory: [78, 82, 80, 76, 79, 83, 85, 88, 84, 87] },
  { id: '6', title: 'Frank Miller', satisfactionScore: 77, vsCrewAvg: 2, preferencesTotal: 9, satisfactionRank: 4, totalRankedCrew: 9, satisfactionHistory: [68, 70, 72, 75, 73, 78, 80, 82, 85, 83] },
  { id: '7', title: 'Grace Lee', satisfactionScore: 92, vsCrewAvg: 17, preferencesTotal: 12, satisfactionRank: 1, totalRankedCrew: 9, satisfactionHistory: [90, 88, 92, 89, 91, 93, 90, 94, 92, 95] },
  { id: '8', title: 'Henry Wilson', satisfactionScore: 66, vsCrewAvg: -9, preferencesTotal: 4, satisfactionRank: 7, totalRankedCrew: 9, satisfactionHistory: [62, 58, 65, 60, 63, 67, 70, 68, 72, 74] },
  { id: '9', title: 'Ivy Chen', satisfactionScore: 81, vsCrewAvg: 6, preferencesTotal: 8, satisfactionRank: 4, totalRankedCrew: 9, satisfactionHistory: [75, 78, 76, 80, 82, 79, 84, 86, 83, 88] },
];

// Standalone card component for expanded grid view - EXACT SAME as carousel card
export function CrewQuickLookCardStatic({ card, onClick }: { card: CardData; onClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="rounded-2xl px-4 py-3 flex flex-col gap-3"
      style={{
        background: isHovered ? '#302F35' : '#252429',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* Crew name - top */}
      <span
        style={{
          fontFamily: 'var(--font-open-sans)',
          color: '#DBDADB',
          fontWeight: 350,
          fontSize: 14,
        }}
      >
        {card.title}
      </span>

      {/* Stats and graph - responsive flex layout */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Column 1 - min width for wrapping */}
        <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 120 }}>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#7C7F82',
                fontWeight: 350,
              }}
            >
              Satisfaction
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#DBDADB',
                fontWeight: 350,
              }}
            >
              {card.satisfactionScore !== undefined ? `${Math.round(card.satisfactionScore)}%` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#7C7F82',
                fontWeight: 350,
              }}
            >
              Vs crew
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: card.vsCrewAvg === undefined ? '#7C7F82' : (card.vsCrewAvg >= 0 ? '#4ADE80' : '#F87171'),
                fontWeight: 350,
              }}
            >
              {card.vsCrewAvg !== undefined ? `${card.vsCrewAvg >= 0 ? '+' : ''}${Math.round(card.vsCrewAvg)}%` : '—'}
            </span>
          </div>
        </div>

        {/* Divider 1 - hidden on wrap */}
        <div
          className="hidden sm:block"
          style={{
            width: 1,
            height: 48,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
          }}
        />

        {/* Column 2 - min width for wrapping */}
        <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 120 }}>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#7C7F82',
                fontWeight: 350,
              }}
            >
              Preferences
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#DBDADB',
                fontWeight: 350,
              }}
            >
              {card.preferencesTotal ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#7C7F82',
                fontWeight: 350,
              }}
            >
              Satisfaction rank
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#DBDADB',
                fontWeight: 350,
              }}
            >
              {card.satisfactionRank !== undefined && card.totalRankedCrew !== undefined
                ? `${card.satisfactionRank}/${card.totalRankedCrew}`
                : '—'}
            </span>
          </div>
        </div>

        {/* Divider 2 - hidden on wrap */}
        <div
          className="hidden sm:block"
          style={{
            width: 1,
            height: 48,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
          }}
        />

        {/* Graph - flexible width with minimum */}
        <div className="flex items-start justify-center flex-shrink-0" style={{ width: 100 }}>
          {(() => {
            const data = card.satisfactionHistory || [70, 72, 75, 73, 78, 80, 77, 82, 85, 83];
            const width = 100;
            const height = 50;
            const padding = 4;
            
            // Calculate min/max for scaling (with some padding)
            const minVal = Math.min(...data) - 5;
            const maxVal = Math.max(...data) + 5;
            const range = maxVal - minVal;
            
            // Generate points for the line
            const points = data.map((val, i) => {
              const x = padding + (i / (data.length - 1)) * (width - padding * 2);
              const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
              return `${x},${y}`;
            }).join(' ');
            
            // Generate area path (line + bottom fill)
            const areaPath = data.map((val, i) => {
              const x = padding + (i / (data.length - 1)) * (width - padding * 2);
              const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ') + ` L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
            
            // Determine trend color based on first vs last value
            const trend = data[data.length - 1] - data[0];
            const lineColor = trend >= 0 ? '#4ADE80' : '#F87171';  // green if up, red if down
            const gradientId = `sparkGradientStatic-${card.id}`;
            
            return (
              <svg width={width} height={height} style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Area fill */}
                <path
                  d={areaPath}
                  fill={`url(#${gradientId})`}
                />
                {/* Line */}
                <polyline
                  points={points}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* End dot */}
                <circle
                  cx={width - padding}
                  cy={height - padding - ((data[data.length - 1] - minVal) / range) * (height - padding * 2)}
                  r="2.5"
                  fill={lineColor}
                />
              </svg>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// Export CardData type
export type { CardData as CrewCardData };

// Glass UI version for light mode list views
export function CrewQuickLookCardGlass({ card, onClick }: { card: CardData; onClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="rounded-2xl px-4 py-3 flex flex-col gap-3"
      style={{
        ...aiGlassLightContentStyle('1rem', isHovered ? 0.7 : 0.6),
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* Crew name - top */}
      <span
        style={{
          fontFamily: 'var(--font-open-sans)',
          color: '#2C2C2C',
          fontWeight: 500,
          fontSize: 14,
        }}
      >
        {card.title}
      </span>

      {/* Stats and graph - responsive flex layout */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Column 1 - min width for wrapping */}
        <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 120 }}>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#6B6B6B',
                fontWeight: 350,
              }}
            >
              Satisfaction
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#2C2C2C',
                fontWeight: 350,
              }}
            >
              {card.satisfactionScore !== undefined ? `${Math.round(card.satisfactionScore)}%` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#6B6B6B',
                fontWeight: 350,
              }}
            >
              Vs crew
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: card.vsCrewAvg === undefined ? '#6B6B6B' : (card.vsCrewAvg >= 0 ? '#16a34a' : '#dc2626'),
                fontWeight: 350,
              }}
            >
              {card.vsCrewAvg !== undefined ? `${card.vsCrewAvg >= 0 ? '+' : ''}${Math.round(card.vsCrewAvg)}%` : '—'}
            </span>
          </div>
        </div>

        {/* Divider 1 - hidden on wrap */}
        <div
          className="hidden sm:block"
          style={{
            width: 1,
            height: 48,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.1) 70%, transparent 100%)',
          }}
        />

        {/* Column 2 - min width for wrapping */}
        <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 120 }}>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#6B6B6B',
                fontWeight: 350,
              }}
            >
              Preferences
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#2C2C2C',
                fontWeight: 350,
              }}
            >
              {card.preferencesTotal ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#6B6B6B',
                fontWeight: 350,
              }}
            >
              Satisfaction rank
            </span>
            <span
              className="text-[13px] text-right"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#2C2C2C',
                fontWeight: 350,
              }}
            >
              {card.satisfactionRank !== undefined && card.totalRankedCrew !== undefined
                ? `${card.satisfactionRank}/${card.totalRankedCrew}`
                : '—'}
            </span>
          </div>
        </div>

        {/* Divider 2 - hidden on wrap */}
        <div
          className="hidden sm:block"
          style={{
            width: 1,
            height: 48,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.1) 70%, transparent 100%)',
          }}
        />

        {/* Graph - flexible width with minimum */}
        <div className="flex items-start justify-center flex-shrink-0" style={{ width: 100 }}>
          {(() => {
            const data = card.satisfactionHistory || [70, 72, 75, 73, 78, 80, 77, 82, 85, 83];
            const width = 100;
            const height = 50;
            const padding = 4;

            // Calculate min/max for scaling (with some padding)
            const minVal = Math.min(...data) - 5;
            const maxVal = Math.max(...data) + 5;
            const range = maxVal - minVal;

            // Generate points for the line
            const points = data.map((val, i) => {
              const x = padding + (i / (data.length - 1)) * (width - padding * 2);
              const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
              return `${x},${y}`;
            }).join(' ');

            // Generate area path (line + bottom fill)
            const areaPath = data.map((val, i) => {
              const x = padding + (i / (data.length - 1)) * (width - padding * 2);
              const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ') + ` L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;

            // Determine trend color based on first vs last value
            const trend = data[data.length - 1] - data[0];
            const lineColor = trend >= 0 ? '#16a34a' : '#dc2626';  // green-600 / red-600 for light mode
            const gradientId = `sparkGradientGlass-${card.id}`;

            return (
              <svg width={width} height={height} style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Area fill */}
                <path
                  d={areaPath}
                  fill={`url(#${gradientId})`}
                />
                {/* Line */}
                <polyline
                  points={points}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* End dot */}
                <circle
                  cx={width - padding}
                  cy={height - padding - ((data[data.length - 1] - minVal) / range) * (height - padding * 2)}
                  r="2.5"
                  fill={lineColor}
                />
              </svg>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
