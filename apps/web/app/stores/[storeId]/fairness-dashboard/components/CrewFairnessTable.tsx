'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface CrewFairnessRow {
  name: string;
  minsPerShift: number;
  lastAssignedDays: number; // days ago
  deviation: number; // percentage, can be positive or negative
}

type SortField = 'name' | 'minsPerShift' | 'lastAssigned' | 'deviation';
type SortDirection = 'asc' | 'desc';

// Format minutes to readable string (e.g., "30 min", "1 hr 10 min", "2 hr")
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

interface CrewFairnessTableProps {
  title?: string;
  data: CrewFairnessRow[];
  middleRows?: number; // How many fully visible rows in the middle (default 6)
  stackedBehind?: number; // How many stacked/faded rows behind (default 2)
}

export function CrewFairnessTable({ title, data, middleRows = 6, stackedBehind = 2 }: CrewFairnessTableProps) {
  const [sortField, setSortField] = useState<SortField>('deviation');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [scrollPosition, setScrollPosition] = useState(0);
  const [targetPosition, setTargetPosition] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollPositionRef = useRef(scrollPosition);
  const targetPositionRef = useRef(0);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    scrollPositionRef.current = scrollPosition;
  }, [scrollPosition]);
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    // Reset scroll position when sorting changes
    setScrollPosition(0);
    setTargetPosition(0);
    targetPositionRef.current = 0;
  };
  
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'minsPerShift':
          comparison = a.minsPerShift - b.minsPerShift;
          break;
        case 'lastAssigned':
          comparison = a.lastAssignedDays - b.lastAssignedDays;
          break;
        case 'deviation':
          comparison = Math.abs(a.deviation) - Math.abs(b.deviation);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortField, sortDirection]);

  const animateToTarget = () => {
    const current = scrollPositionRef.current;
    const target = targetPositionRef.current;
    const diff = target - current;

    if (Math.abs(diff) < 0.05) {
      setScrollPosition(target);
      isAnimatingRef.current = false;
      return;
    }

    const newPosition = current + diff * 0.35;
    setScrollPosition(newPosition);
    requestAnimationFrame(animateToTarget);
  };

  // Maximum position is limited so we always show middleRows cards
  const maxPosition = Math.max(0, sortedData.length - middleRows);

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
    if (targetPositionRef.current < maxPosition) {
      const newTarget = Math.min(targetPositionRef.current + 1, maxPosition);
      targetPositionRef.current = newTarget;
      setTargetPosition(newTarget);
      if (!isAnimatingRef.current) {
        isAnimatingRef.current = true;
        requestAnimationFrame(animateToTarget);
      }
    }
  };

  const canGoUp = targetPosition > 0;
  const canGoDown = targetPosition < maxPosition;
  
  const formatLastAssigned = (days: number) => {
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  };
  
  const formatDeviation = (deviation: number) => {
    const sign = deviation >= 0 ? '+' : '';
    return `${sign}${deviation.toFixed(1)}%`;
  };
  
  const getDeviationColor = (deviation: number) => {
    const absDeviation = Math.abs(deviation);
    if (absDeviation <= 5) return '#6B8E6B'; // Good - muted green
    if (absDeviation <= 15) return '#B8A06B'; // Warning - muted yellow/gold
    return '#A06B6B'; // Bad - muted red
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    const isActive = sortField === field;
    return (
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        style={{ 
          marginLeft: '4px',
          opacity: isActive ? 1 : 0.3,
          transition: 'opacity 0.15s ease',
        }}
      >
        {sortDirection === 'asc' && isActive ? (
          <path d="M5 2 L9 7 L1 7 Z" fill="#7C7F82" />
        ) : (
          <path d="M5 8 L9 3 L1 3 Z" fill="#7C7F82" />
        )}
      </svg>
    );
  };

  // Carousel settings
  const pillHeight = 44; // Height of each pill
  const middleGap = 6; // Gap between middle rows
  const stackOffset = 12; // How much each stacked pill is offset behind
  const maxCardsAbove = 2; // Cards that can scroll above
  const totalVisibleRows = middleRows + stackedBehind;
  const reservedTopSpace = 12; // Fixed space for cards above (reduced gap)
  const reservedBottomSpace = stackedBehind * stackOffset;
  const middleHeight = middleRows * pillHeight + (middleRows - 1) * middleGap;
  const totalHeight = middleHeight + reservedTopSpace + reservedBottomSpace;

  // Get visible cards with their relative positions
  const getVisibleCards = () => {
    const visibleCards: Array<CrewFairnessRow & { relativePosition: number; actualIndex: number }> = [];
    const floorPos = Math.floor(scrollPosition);
    const ceilPos = Math.ceil(scrollPosition);
    const startIdx = Math.max(0, Math.min(floorPos, ceilPos) - maxCardsAbove);
    const endIdx = Math.min(sortedData.length - 1, Math.max(floorPos, ceilPos) + totalVisibleRows);

    for (let i = startIdx; i <= endIdx; i++) {
      const relativePosition = i - scrollPosition;
      if (relativePosition >= -maxCardsAbove - 0.5 && relativePosition <= totalVisibleRows + 0.5) {
        visibleCards.push({
          ...sortedData[i],
          relativePosition,
          actualIndex: i,
        });
      }
    }
    return visibleCards;
  };

  const visibleCards = getVisibleCards();

  // Determine if a row is in the "middle" (fully visible) section or stacked behind
  // Use actualIndex and targetPosition to avoid flicker during animation
  const getRowState = (actualIndex: number, relativePosition: number) => {
    const relativeToTarget = actualIndex - targetPosition;
    
    if (relativeToTarget < 0) {
      // Above - scrolled past
      return { isMiddle: false, isAbove: true, stackDistance: Math.abs(relativeToTarget) };
    } else if (relativeToTarget < middleRows) {
      // In the middle section - fully visible
      return { isMiddle: true, isAbove: false, stackDistance: 0 };
    } else {
      // Behind - stacked (use relativeToTarget for consistent styling)
      const stackDistance = relativeToTarget - middleRows + 1;
      return { isMiddle: false, isAbove: false, stackDistance };
    }
  };

  // Calculate Y position for a row
  // Uses actualIndex + targetPosition to determine section, but relativePosition for smooth animation within section
  const getRowOffsetY = (actualIndex: number, relativePosition: number) => {
    const relativeToTarget = actualIndex - targetPosition;
    
    if (relativeToTarget < 0) {
      // Above - use stack offset going up
      return reservedTopSpace + relativePosition * stackOffset;
    } else if (relativeToTarget < middleRows) {
      // In middle section - linear spacing
      return reservedTopSpace + relativePosition * (pillHeight + middleGap);
    } else {
      // Behind - stack underneath the last middle row
      const lastMiddleRowY = reservedTopSpace + (middleRows - 1) * (pillHeight + middleGap);
      const behindIndex = relativeToTarget - middleRows;
      return lastMiddleRowY + (behindIndex + 1) * stackOffset;
    }
  };

  // Get pill color based on position
  const getPillColor = (stackDistance: number, isMiddle: boolean, actualIndex: number) => {
    const mainR = 37, mainG = 36, mainB = 41;  // #252429
    const hoverR = 48, hoverG = 47, hoverB = 53;  // #302F35
    const darkR = 24, darkG = 23, darkB = 27;  // #18171B
    
    if (isMiddle) {
      // Middle rows are all bright, hovered row is lighter
      return (hoveredIndex === actualIndex) ? `rgb(${hoverR}, ${hoverG}, ${hoverB})` : `rgb(${mainR}, ${mainG}, ${mainB})`;
    }
    
    // Stacked rows fade based on distance
    const colorFade = Math.min(stackDistance, stackedBehind) / stackedBehind;
    
    const r = Math.round(mainR - (mainR - darkR) * colorFade);
    const g = Math.round(mainG - (mainG - darkG) * colorFade);
    const b = Math.round(mainB - (mainB - darkB) * colorFade);
    
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div style={{ padding: '8px 0', paddingRight: '4%' }}>
      {/* Content area with continuous vertical line */}
      <div className="flex items-stretch gap-3">
        {/* Left column: vertical line + arrows */}
        <div 
          className="flex flex-col items-center"
          style={{ width: '24px' }}
        >
          {/* Vertical line from title through header to arrows - continuous with fade */}
          <div
            style={{
              width: '1px',
              flex: 1,
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(255,255,255,0.15) 20%, rgba(255,255,255,0.15) 80%, transparent 95%, transparent 100%)',
            }}
          />
          <button
            onClick={goUp}
            disabled={!canGoUp}
            className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 circle-button-glass-border ${canGoUp ? 'hover:brightness-125' : ''}`}
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
              width="12"
              height="12"
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
          {/* Small gap between arrows */}
          <div style={{ height: '4px' }} />
          <button
            onClick={goDown}
            disabled={!canGoDown}
            className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 circle-button-glass-border ${canGoDown ? 'hover:brightness-125' : ''}`}
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
              width="12"
              height="12"
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
          {/* Vertical line below arrows - fades out at end */}
          <div
            style={{
              width: '1px',
              flex: 1,
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(255,255,255,0.15) 20%, rgba(255,255,255,0.15) 80%, transparent 100%)',
            }}
          />
        </div>

        {/* Right column: header row + pill stack */}
        <div className="flex-1 flex flex-col">
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr',
              padding: '10px 12px',
              marginBottom: '8px',
            }}
          >
            <button
              onClick={() => handleSort('name')}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: sortField === 'name' ? '#DBDADB' : '#7C7F82',
                  letterSpacing: '0.5px',
                }}
              >
                Name
              </span>
              <SortIcon field="name" />
            </button>
            
            <button
              onClick={() => handleSort('minsPerShift')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: sortField === 'minsPerShift' ? '#DBDADB' : '#7C7F82',
                  letterSpacing: '0.5px',
                }}
              >
                Time/shift
              </span>
              <SortIcon field="minsPerShift" />
            </button>
            
            <button
              onClick={() => handleSort('lastAssigned')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: sortField === 'lastAssigned' ? '#DBDADB' : '#7C7F82',
                  letterSpacing: '0.5px',
                }}
              >
                Last assigned
              </span>
              <SortIcon field="lastAssigned" />
            </button>
            
            <button
              onClick={() => handleSort('deviation')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: sortField === 'deviation' ? '#DBDADB' : '#7C7F82',
                  letterSpacing: '0.5px',
                }}
              >
                Deviation
              </span>
              <SortIcon field="deviation" />
            </button>
          </div>

          {/* Pill stack */}
          <div
            className="relative flex-1"
            style={{ minHeight: totalHeight }}
          >
          {visibleCards.map((row, idx) => {
            const { relativePosition, actualIndex } = row;
            const rowState = getRowState(actualIndex, relativePosition);
            const offsetY = getRowOffsetY(actualIndex, relativePosition);
            const scale = rowState.isMiddle ? 1 : 1 - (rowState.stackDistance * 0.015);
            const zIndex = rowState.isMiddle 
              ? 10 - Math.round(relativePosition) 
              : rowState.isAbove 
                ? 5 - Math.round(rowState.stackDistance)
                : 5 - Math.round(rowState.stackDistance);

            return (
              <div
                key={`${row.name}-${row.actualIndex}`}
                className="absolute w-full"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr',
                  padding: '10px 16px',
                  height: pillHeight,
                  borderRadius: '20px',
                  background: getPillColor(rowState.stackDistance, rowState.isMiddle, actualIndex),
                  boxShadow: rowState.isMiddle 
                    ? '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)' 
                    : '0 2px 8px rgba(0, 0, 0, 0.15)',
                  transform: `translateY(${offsetY}px) scale(${scale})`,
                  transformOrigin: 'top center',
                  zIndex,
                  cursor: rowState.isMiddle ? 'pointer' : 'default',
                }}
                onMouseEnter={() => rowState.isMiddle && setHoveredIndex(actualIndex)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 400,
                      color: rowState.isMiddle ? '#DBDADB' : '#7C7F82',
                    }}
                  >
                    {row.name}
                  </span>
                </div>
                
                {/* Time/Shift */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 400,
                      color: rowState.isMiddle ? '#9B9A9F' : '#6B6A6F',
                    }}
                  >
                    {formatMinutesToReadable(row.minsPerShift)}
                  </span>
                </div>
                
                {/* Last Assigned */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 400,
                      color: rowState.isMiddle ? '#9B9A9F' : '#6B6A6F',
                    }}
                  >
                    {formatLastAssigned(row.lastAssignedDays)}
                  </span>
                </div>
                
                {/* Deviation */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: rowState.isMiddle ? getDeviationColor(row.deviation) : '#6B6A6F',
                    }}
                  >
                    {formatDeviation(row.deviation)}
                  </span>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
      
      {/* Position indicator */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginTop: '24px',
          paddingLeft: '36px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            fontWeight: 350,
            color: '#7C7F82',
          }}
        >
          {Math.round(targetPosition + 1)}-{Math.min(Math.round(targetPosition + middleRows), sortedData.length)} of {sortedData.length}
        </span>
      </div>
    </div>
  );
}

export default CrewFairnessTable;
