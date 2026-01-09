'use client';

import React, { useState, useRef, useEffect } from 'react';

// Trend types for the 5-option system
type FairnessTrend = 
  | 'significantly_improving'
  | 'improving'
  | 'stable'
  | 'worsening'
  | 'significantly_worsening';

interface RoleCardData {
  id: string;
  name: string;
  emoji: string;
  // 6 stats
  giniCoefficient: number;
  trend: FairnessTrend;
  crewCount: number;
  totalCrew?: number; // total crew eligible for this role
  avgMinutes: number;
  medianHours: number;
  vsRoleAvgPct: number | null; // simple difference from average fairness (e.g., 46% - 38% = +8%), null for untracked roles
  // Lorenz curve data (cumulative % of crew vs cumulative % of hours)
  lorenzData?: { crewPct: number; hoursPct: number }[];
  // Additional stats for role dashboard
  minutesWorkedOnRoleTotal?: number;       // Total minutes spent on this role across selection
  totalMinutesWorkedSelection?: number;    // Total minutes on ALL roles in selection
  minutesOnRoleVsTotalWorkPct?: number;    // (minutesWorkedOnRoleTotal / totalMinutesWorkedSelection) * 100
  avgFairnessIndexPct?: number | null;     // Average fairness index across dates (0-100)
}

interface RoleQuickLookCarouselProps {
  cards?: RoleCardData[];
  onNavigationChange?: (canGoUp: boolean, canGoDown: boolean, goUp: () => void, goDown: () => void, totalCount: number, currentIndex: number) => void;
  renderButtons?: boolean;
  onCardClick?: (card: RoleCardData) => void;
}

// Helper functions for trend display
function getTrendLabel(trend: FairnessTrend): string {
  switch (trend) {
    case 'significantly_improving': return 'Rising fast';
    case 'improving': return 'Rising';
    case 'stable': return 'Stable';
    case 'worsening': return 'Falling';
    case 'significantly_worsening': return 'Falling fast';
  }
}

function getTrendColor(trend: FairnessTrend): string {
  switch (trend) {
    case 'significantly_improving': return '#22C55E'; // green-500
    case 'improving': return '#4ADE80'; // green-400
    case 'stable': return '#9CA3AF'; // gray-400
    case 'worsening': return '#FB923C'; // orange-400
    case 'significantly_worsening': return '#F87171'; // red-400
  }
}

function getTrendIcon(trend: FairnessTrend): React.ReactNode {
  const color = getTrendColor(trend);
  switch (trend) {
    case 'significantly_improving':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
          <polyline points="18 9 12 3 6 9" />
        </svg>
      );
    case 'improving':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      );
    case 'stable':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'worsening':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );
    case 'significantly_worsening':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
          <polyline points="6 15 12 21 18 15" />
        </svg>
      );
  }
}

function getGiniColor(gini: number): string {
  if (gini <= 0.1) return '#4ADE80'; // green
  if (gini <= 0.15) return '#FBBF24'; // amber
  return '#F87171'; // red
}

function getVsRoleAvgColor(vsRoleAvgPct: number): string {
  // Positive = better than average (green), negative = worse than average (red)
  // Using simple difference: 5% difference is significant in fairness metrics
  if (vsRoleAvgPct >= 5) return '#4ADE80'; // green (significantly better, e.g., 46% vs 38% = +8%)
  if (vsRoleAvgPct >= 2) return '#86EFAC'; // light green (moderately better)
  if (vsRoleAvgPct >= -2) return '#9CA3AF'; // gray (near average, within ±2%)
  if (vsRoleAvgPct >= -5) return '#FB923C'; // orange (moderately worse)
  return '#F87171'; // red (significantly worse, e.g., 31% vs 38% = -7%)
}

// Format minutes to readable string (e.g., "1 hr 30 min" or "45 min")
function formatMinutesToReadable(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${mins} min`;
}

export function RoleQuickLookCarousel({ cards = [], onNavigationChange, renderButtons = true, onCardClick }: RoleQuickLookCarouselProps) {
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

  // Default placeholder data
  const defaultCards: RoleCardData[] = [
    { 
      id: '1', 
      name: 'Parking Helms', 
      emoji: '🅿️',
      giniCoefficient: 0.054,
      trend: 'improving',
      crewCount: 12,
      avgMinutes: 185,
      medianHours: 6,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 8 },
        { crewPct: 40, hoursPct: 22 },
        { crewPct: 60, hoursPct: 42 },
        { crewPct: 80, hoursPct: 68 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
    { 
      id: '2', 
      name: 'Wine Demo', 
      emoji: '🍷',
      giniCoefficient: 0.032,
      trend: 'stable',
      crewCount: 8,
      avgMinutes: 142,
      medianHours: 4.5,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 12 },
        { crewPct: 40, hoursPct: 28 },
        { crewPct: 60, hoursPct: 48 },
        { crewPct: 80, hoursPct: 72 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
    { 
      id: '3', 
      name: 'Food Demo', 
      emoji: '🍕',
      giniCoefficient: 0.098,
      trend: 'significantly_improving',
      crewCount: 15,
      avgMinutes: 210,
      medianHours: 7,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 6 },
        { crewPct: 40, hoursPct: 18 },
        { crewPct: 60, hoursPct: 38 },
        { crewPct: 80, hoursPct: 65 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
    { 
      id: '4', 
      name: 'Cart Pusher', 
      emoji: '🛒',
      giniCoefficient: 0.156,
      trend: 'worsening',
      crewCount: 10,
      avgMinutes: 95,
      medianHours: 3,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 4 },
        { crewPct: 40, hoursPct: 14 },
        { crewPct: 60, hoursPct: 32 },
        { crewPct: 80, hoursPct: 58 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
    { 
      id: '5', 
      name: 'Stocker', 
      emoji: '📦',
      giniCoefficient: 0.203,
      trend: 'significantly_worsening',
      crewCount: 18,
      avgMinutes: 168,
      medianHours: 5.5,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 3 },
        { crewPct: 40, hoursPct: 10 },
        { crewPct: 60, hoursPct: 25 },
        { crewPct: 80, hoursPct: 50 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
    { 
      id: '6', 
      name: 'Bakery', 
      emoji: '🥐',
      giniCoefficient: 0.028,
      trend: 'significantly_improving',
      crewCount: 5,
      avgMinutes: 200,
      medianHours: 6.5,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 14 },
        { crewPct: 40, hoursPct: 32 },
        { crewPct: 60, hoursPct: 52 },
        { crewPct: 80, hoursPct: 76 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
    { 
      id: '7', 
      name: 'Membership', 
      emoji: '🎫',
      giniCoefficient: 0.112,
      trend: 'worsening',
      crewCount: 7,
      avgMinutes: 150,
      medianHours: 5,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 4 },
        { crewPct: 40, hoursPct: 14 },
        { crewPct: 60, hoursPct: 32 },
        { crewPct: 80, hoursPct: 58 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
    { 
      id: '8', 
      name: 'Receiving', 
      emoji: '🚚',
      giniCoefficient: 0.065,
      trend: 'improving',
      crewCount: 4,
      avgMinutes: 240,
      medianHours: 8,
      vsRoleAvgPct: null,
      lorenzData: [
        { crewPct: 0, hoursPct: 0 },
        { crewPct: 20, hoursPct: 9 },
        { crewPct: 40, hoursPct: 24 },
        { crewPct: 60, hoursPct: 44 },
        { crewPct: 80, hoursPct: 69 },
        { crewPct: 100, hoursPct: 100 },
      ],
    },
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
    const visibleCards: Array<RoleCardData & { relativePosition: number; actualIndex: number }> = [];
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

  const canGoUp = targetPosition > 0;
  const canGoDown = targetPosition < allCards.length - 1;

  useEffect(() => {
    if (onNavigationChange) {
      onNavigationChange(canGoUp, canGoDown, goUp, goDown, allCards.length, targetPosition);
    }
  }, [canGoUp, canGoDown, onNavigationChange, allCards.length, targetPosition]);

  return (
    <div className={renderButtons ? "flex items-center gap-4" : ""}>
      {/* Arrow buttons on the left */}
      {renderButtons && (
        <div className="flex flex-col gap-2">
          <button
            onClick={goUp}
            disabled={!canGoUp}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
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
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
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
          const opacity = 1;
          const zIndex = 10 - Math.round(distance);
          const isMain = Math.abs(relativePosition) < 0.5;

          const getCardColor = () => {
            const mainR = 39, mainG = 38, mainB = 41;
            const hoverR = 50, hoverG = 49, hoverB = 55;
            const darkR = 28, darkG = 27, darkB = 31;
            const colorFade = Math.min(distance, 2) / 2;
            const baseR = (isMain && isHovered) ? hoverR : mainR;
            const baseG = (isMain && isHovered) ? hoverG : mainG;
            const baseB = (isMain && isHovered) ? hoverB : mainB;
            const r = Math.round(baseR - (baseR - darkR) * colorFade);
            const g = Math.round(baseG - (baseG - darkG) * colorFade);
            const b = Math.round(baseB - (baseB - darkB) * colorFade);
            return `rgb(${r}, ${g}, ${b})`;
          };

          return (
            <div
              key={card.id}
              ref={isMain ? mainCardRef : undefined}
              className="absolute w-full quick-card-glass-border"
              style={{
                borderRadius: '1rem',
                minHeight: baseCardHeight,
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
              onClick={() => isMain && onCardClick?.(card)}
            >
              <div
                className="p-4 flex flex-col gap-4"
                style={{
                  opacity: isMain ? 1 : 0,
                  pointerEvents: isMain ? 'auto' : 'none',
                  borderRadius: '1rem',
                  overflow: 'hidden',
                }}
              >
                {/* Role name - top */}
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#DBDADB',
                    fontWeight: 350,
                    fontSize: 14,
                  }}
                >
                  {card.name}
                </span>

                {/* Stats grid and Lorenz curve - responsive flex layout */}
                <div className="flex items-center gap-3" style={{ minHeight: 0 }}>
                  {/* Stats: 2 cols × 3 rows with divider */}
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    {/* Column 1 */}
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[13px]"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: '#7C7F82',
                            fontWeight: 350,
                          }}
                        >
                          Fairness
                        </span>
                        <span
                          className="text-[13px] font-mono"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: getGiniColor(card.giniCoefficient),
                            fontWeight: 500,
                          }}
                        >
                          {((1 - card.giniCoefficient) * 100).toFixed(1)}%
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
                          Vs roles
                        </span>
                        <span
                          className="text-[13px] font-mono"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: card.vsRoleAvgPct !== null ? getVsRoleAvgColor(card.vsRoleAvgPct) : '#7C7F82',
                            fontWeight: 350,
                          }}
                        >
                          {card.vsRoleAvgPct !== null
                            ? `${card.vsRoleAvgPct >= 0 ? '+' : ''}${card.vsRoleAvgPct.toFixed(1)}%`
                            : 'N/A'}
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
                          Avg shift time
                        </span>
                        <span
                          className="text-[13px]"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: '#DBDADB',
                            fontWeight: 350,
                          }}
                        >
                          {formatMinutesToReadable(card.avgMinutes)}
                        </span>
                      </div>
                    </div>

                    {/* Divider between stat columns */}
                    <div
                      className="hidden sm:block"
                      style={{
                        width: 1,
                        height: 72,
                        background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
                      }}
                    />

                    {/* Column 2 */}
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[13px]"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: '#7C7F82',
                            fontWeight: 350,
                          }}
                        >
                          Trend
                        </span>
                        <div className="flex items-center gap-1">
                          {getTrendIcon(card.trend)}
                          <span
                            className="text-[12px]"
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              color: getTrendColor(card.trend),
                              fontWeight: 350,
                            }}
                          >
                            {getTrendLabel(card.trend)}
                          </span>
                        </div>
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
                          Total hrs
                        </span>
                        <span
                          className="text-[13px]"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: '#DBDADB',
                            fontWeight: 350,
                          }}
                        >
                          {card.medianHours}
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
                          Crew assigned
                        </span>
                        <span
                          className="text-[13px]"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: '#DBDADB',
                            fontWeight: 350,
                          }}
                        >
                          {card.crewCount}/{card.totalCrew || card.crewCount + 2}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Divider before graph */}
                  <div
                    className="hidden sm:block"
                    style={{
                      width: 1,
                      height: 72,
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
                    }}
                  />

                  {/* Lorenz Curve Graph */}
                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 100, height: 72 }}>
                    {(() => {
                      const data = card.lorenzData || [
                        { crewPct: 0, hoursPct: 0 },
                        { crewPct: 20, hoursPct: 10 },
                        { crewPct: 40, hoursPct: 25 },
                        { crewPct: 60, hoursPct: 45 },
                        { crewPct: 80, hoursPct: 70 },
                        { crewPct: 100, hoursPct: 100 },
                      ];
                      const width = 100;
                      const height = 72;
                      const padding = 8;
                      const graphWidth = width - padding * 2;
                      const graphHeight = height - padding * 2;

                      // Equality line (diagonal)
                      const equalityPoints = `${padding},${height - padding} ${width - padding},${padding}`;

                      // Lorenz curve path
                      const lorenzPath = data.map((point, i) => {
                        const x = padding + (point.crewPct / 100) * graphWidth;
                        const y = height - padding - (point.hoursPct / 100) * graphHeight;
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                      }).join(' ');

                      // Area below the Lorenz curve (gradient drops below like sparkline)
                      const areaPath = data.map((point, i) => {
                        const x = padding + (point.crewPct / 100) * graphWidth;
                        const y = height - padding - (point.hoursPct / 100) * graphHeight;
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                      }).join(' ') + ` L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;

                      const giniColor = getGiniColor(card.giniCoefficient);
                      const gradientId = `lorenzGradient-${card.id}`;

                      return (
                        <svg width={width} height={height} style={{ overflow: 'visible' }}>
                          <defs>
                            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor={giniColor} stopOpacity="0.3" />
                              <stop offset="100%" stopColor={giniColor} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          
                          {/* Equality line (perfect fairness) */}
                          <polyline
                            points={equalityPoints}
                            fill="none"
                            stroke="rgba(255,255,255,0.25)"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                          />
                          
                          {/* Area fill below curve */}
                          <path
                            d={areaPath}
                            fill={`url(#${gradientId})`}
                          />
                          
                          {/* Lorenz curve */}
                          <path
                            d={lorenzPath}
                            fill="none"
                            stroke={giniColor}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          
                          {/* End point dot */}
                          <circle
                            cx={width - padding}
                            cy={padding}
                            r="2.5"
                            fill={giniColor}
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

export function RoleQuickLookCard({ children }: { children?: React.ReactNode }) {
  const [isCardHovered, setIsCardHovered] = useState(false);

  return (
    <div
      className="relative w-full"
      style={{
        borderRadius: '1rem',
        minHeight: 120,
        overflow: 'hidden',
        background: isCardHovered ? '#2A292E' : '#1E1D22',
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

// Export default role cards data for use in expanded view
export const defaultRoleCards: RoleCardData[] = [
  { 
    id: '1', 
    name: 'Cashier', 
    emoji: '💰',
    giniCoefficient: 0.045,
    trend: 'improving',
    crewCount: 12,
    totalCrew: 15,
    avgMinutes: 180,
    medianHours: 6,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 8 },
      { crewPct: 40, hoursPct: 22 },
      { crewPct: 60, hoursPct: 42 },
      { crewPct: 80, hoursPct: 68 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
  { 
    id: '2', 
    name: 'Wine Demo', 
    emoji: '🍷',
    giniCoefficient: 0.032,
    trend: 'stable',
    crewCount: 8,
    avgMinutes: 142,
    medianHours: 4.5,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 12 },
      { crewPct: 40, hoursPct: 28 },
      { crewPct: 60, hoursPct: 48 },
      { crewPct: 80, hoursPct: 72 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
  { 
    id: '3', 
    name: 'Food Demo', 
    emoji: '🍕',
    giniCoefficient: 0.098,
    trend: 'significantly_improving',
    crewCount: 15,
    avgMinutes: 210,
    medianHours: 7,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 6 },
      { crewPct: 40, hoursPct: 18 },
      { crewPct: 60, hoursPct: 38 },
      { crewPct: 80, hoursPct: 65 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
  { 
    id: '4', 
    name: 'Cart Pusher', 
    emoji: '🛒',
    giniCoefficient: 0.078,
    trend: 'worsening',
    crewCount: 6,
    avgMinutes: 95,
    medianHours: 3,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 5 },
      { crewPct: 40, hoursPct: 15 },
      { crewPct: 60, hoursPct: 35 },
      { crewPct: 80, hoursPct: 62 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
  { 
    id: '5', 
    name: 'Stocker', 
    emoji: '📦',
    giniCoefficient: 0.056,
    trend: 'stable',
    crewCount: 10,
    totalCrew: 12,
    avgMinutes: 165,
    medianHours: 5.5,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 10 },
      { crewPct: 40, hoursPct: 25 },
      { crewPct: 60, hoursPct: 45 },
      { crewPct: 80, hoursPct: 70 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
  { 
    id: '6', 
    name: 'Bakery', 
    emoji: '🥐',
    giniCoefficient: 0.028,
    trend: 'significantly_improving',
    crewCount: 5,
    avgMinutes: 200,
    medianHours: 6.5,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 14 },
      { crewPct: 40, hoursPct: 32 },
      { crewPct: 60, hoursPct: 52 },
      { crewPct: 80, hoursPct: 76 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
  { 
    id: '7', 
    name: 'Membership', 
    emoji: '🎫',
    giniCoefficient: 0.112,
    trend: 'worsening',
    crewCount: 7,
    totalCrew: 10,
    avgMinutes: 150,
    medianHours: 5,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 4 },
      { crewPct: 40, hoursPct: 14 },
      { crewPct: 60, hoursPct: 32 },
      { crewPct: 80, hoursPct: 58 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
  { 
    id: '8', 
    name: 'Receiving', 
    emoji: '🚚',
    giniCoefficient: 0.065,
    trend: 'improving',
    crewCount: 4,
    avgMinutes: 240,
    medianHours: 8,
    vsRoleAvgPct: null,
    lorenzData: [
      { crewPct: 0, hoursPct: 0 },
      { crewPct: 20, hoursPct: 9 },
      { crewPct: 40, hoursPct: 24 },
      { crewPct: 60, hoursPct: 44 },
      { crewPct: 80, hoursPct: 69 },
      { crewPct: 100, hoursPct: 100 },
    ],
  },
];

// Standalone card component for expanded grid view - EXACT SAME as carousel card
export function RoleQuickLookCardStatic({ card, onClick }: { card: RoleCardData; onClick?: () => void }) {
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
      {/* Role name - top */}
      <span
        style={{
          fontFamily: 'var(--font-open-sans)',
          color: '#DBDADB',
          fontWeight: 350,
          fontSize: 14,
        }}
      >
        {card.name}
      </span>

      {/* Stats grid and Lorenz curve - responsive flex layout */}
      <div className="flex items-center gap-3" style={{ minHeight: 0 }}>
        {/* Stats: 2 cols × 3 rows with divider */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {/* Column 1 */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[13px]"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#7C7F82',
                  fontWeight: 350,
                }}
              >
                Fairness
              </span>
              <span
                className="text-[13px] font-mono"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: getGiniColor(card.giniCoefficient),
                  fontWeight: 500,
                }}
              >
                {((1 - card.giniCoefficient) * 100).toFixed(1)}%
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
                Vs roles
              </span>
              <span
                className="text-[13px] font-mono"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: card.vsRoleAvgPct !== null ? getVsRoleAvgColor(card.vsRoleAvgPct) : '#7C7F82',
                  fontWeight: 350,
                }}
              >
                {card.vsRoleAvgPct !== null
                  ? `${card.vsRoleAvgPct >= 0 ? '+' : ''}${card.vsRoleAvgPct.toFixed(1)}%`
                  : 'N/A'}
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
                Avg shift time
              </span>
              <span
                className="text-[13px]"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#DBDADB',
                  fontWeight: 350,
                }}
              >
                {formatMinutesToReadable(card.avgMinutes)}
              </span>
            </div>
          </div>

          {/* Divider between stat columns */}
          <div
            className="hidden sm:block"
            style={{
              width: 1,
              height: 72,
              background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
            }}
          />

          {/* Column 2 */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[13px]"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#7C7F82',
                  fontWeight: 350,
                }}
              >
                Trend
              </span>
              <div className="flex items-center gap-1">
                {getTrendIcon(card.trend)}
                <span
                  className="text-[12px]"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: getTrendColor(card.trend),
                    fontWeight: 350,
                  }}
                >
                  {getTrendLabel(card.trend)}
                </span>
              </div>
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
                Total hrs
              </span>
              <span
                className="text-[13px]"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#DBDADB',
                  fontWeight: 350,
                }}
              >
                {card.medianHours}
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
                Crew assigned
              </span>
              <span
                className="text-[13px]"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#DBDADB',
                  fontWeight: 350,
                }}
              >
                {card.crewCount}/{card.totalCrew || card.crewCount + 2}
              </span>
            </div>
          </div>
        </div>

        {/* Divider before graph */}
        <div
          className="hidden sm:block"
          style={{
            width: 1,
            height: 72,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
          }}
        />

        {/* Lorenz Curve Graph */}
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 100, height: 72 }}>
          {(() => {
            const data = card.lorenzData || [
              { crewPct: 0, hoursPct: 0 },
              { crewPct: 20, hoursPct: 10 },
              { crewPct: 40, hoursPct: 25 },
              { crewPct: 60, hoursPct: 45 },
              { crewPct: 80, hoursPct: 70 },
              { crewPct: 100, hoursPct: 100 },
            ];
            const width = 100;
            const height = 72;
            const padding = 8;
            const graphWidth = width - padding * 2;
            const graphHeight = height - padding * 2;

            // Equality line (diagonal)
            const equalityPoints = `${padding},${height - padding} ${width - padding},${padding}`;

            // Lorenz curve path
            const lorenzPath = data.map((point, i) => {
              const x = padding + (point.crewPct / 100) * graphWidth;
              const y = height - padding - (point.hoursPct / 100) * graphHeight;
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ');

            // Area below the Lorenz curve (gradient drops below like sparkline)
            const areaPath = data.map((point, i) => {
              const x = padding + (point.crewPct / 100) * graphWidth;
              const y = height - padding - (point.hoursPct / 100) * graphHeight;
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ') + ` L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;

            const giniColor = getGiniColor(card.giniCoefficient);
            const gradientId = `lorenzGradientStatic-${card.id}`;

            return (
              <svg width={width} height={height} style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={giniColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={giniColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                
                {/* Equality line (perfect fairness) */}
                <polyline
                  points={equalityPoints}
                  fill="none"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                
                {/* Area fill below curve */}
                <path
                  d={areaPath}
                  fill={`url(#${gradientId})`}
                />
                
                {/* Lorenz curve */}
                <path
                  d={lorenzPath}
                  fill="none"
                  stroke={giniColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                
                {/* End dot */}
                <circle
                  cx={width - padding}
                  cy={padding}
                  r="2.5"
                  fill={giniColor}
                />
              </svg>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// Export RoleCardData type
export type { RoleCardData };
