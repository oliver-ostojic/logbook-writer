'use client';

import React, { useState, useMemo } from 'react';
import { CardSmall, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

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
  data: CrewFairnessRow[];
  visibleRows?: number;
}

const ROW_HEIGHT = 48; // Height of each row card in pixels (including gap)

export function CrewFairnessTable({ data, visibleRows = 6 }: CrewFairnessTableProps) {
  const [sortField, setSortField] = useState<SortField>('deviation');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
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

  const formatLastAssigned = (days: number) => {
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  };

  const formatDeviation = (deviation: number) => {
    const sign = deviation >= 0 ? '+' : '';
    return `${sign}${deviation.toFixed(1)}%`;
  };

  // Light mode deviation colors
  const getDeviationColor = (deviation: number) => {
    const absDeviation = Math.abs(deviation);
    if (absDeviation <= 5) return '#22C55E'; // Good - green
    if (absDeviation <= 15) return '#EAB308'; // Warning - yellow
    return '#EF4444'; // Bad - red
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
          <path d="M5 2 L9 7 L1 7 Z" fill="#2C2C2C" />
        ) : (
          <path d="M5 8 L9 3 L1 3 Z" fill="#2C2C2C" />
        )}
      </svg>
    );
  };

  if (!data.length) return null;

  // Calculate max height for scrollable area
  const maxScrollHeight = visibleRows * ROW_HEIGHT;

  return (
    <CardSmall
      lightMode={true}
      borderRadius="1.5rem"
      style={{ height: 'auto', overflow: 'hidden' }}
      contentStyle={{ padding: 0, position: 'relative' }}
    >
      {/* Embedded header with title bubble + column headers */}
      <div
        className="ai-glass-border"
        style={{
          ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)
        }}
      >
        <div
          style={{
            ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.4),
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr',
            alignItems: 'center',
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
                  fontSize: '12px',
                  fontWeight: 500,
                  color: sortField === 'name' ? '#2C2C2C' : '#7C7F82',
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
                  fontSize: '12px',
                  fontWeight: 500,
                  color: sortField === 'minsPerShift' ? '#2C2C2C' : '#7C7F82',
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
                  fontSize: '12px',
                  fontWeight: 500,
                  color: sortField === 'lastAssigned' ? '#2C2C2C' : '#7C7F82',
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
                  fontSize: '12px',
                  fontWeight: 500,
                  color: sortField === 'deviation' ? '#2C2C2C' : '#7C7F82',
                }}
              >
                Deviation
              </span>
              <SortIcon field="deviation" />
            </button>
        </div>
      </div>

      {/* Scrollable list content area */}
      <div
        style={{
          maxHeight: maxScrollHeight,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          borderRadius: '0 0 1.5rem 1.5rem',
        }}
      >
        {sortedData.map((row, idx) => {
          const isHovered = hoveredIndex === idx;

          return (
            <div
              key={`${row.name}-${idx}`}
              className="ai-glass-border"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                ...aiGlassLightBorderStyle('12px'),
                cursor: 'pointer',
                transition: 'transform 0.15s ease',
                transform: isHovered ? 'scale(1.01)' : 'scale(1)',
              }}
            >
              <div
                style={{
                  ...aiGlassLightContentStyle('12px', isHovered ? 0.6 : 0.4),
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr',
                  padding: '10px 12px',
                  transition: 'background 0.15s ease',
                }}
              >
                {/* Name - primary, black */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 400,
                      color: '#2C2C2C',
                    }}
                  >
                    {row.name}
                  </span>
                </div>

                {/* Time/Shift - secondary, grey */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 400,
                      color: '#7C7F82',
                    }}
                  >
                    {formatMinutesToReadable(row.minsPerShift)}
                  </span>
                </div>

                {/* Last Assigned - secondary, grey */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 400,
                      color: '#7C7F82',
                    }}
                  >
                    {formatLastAssigned(row.lastAssignedDays)}
                  </span>
                </div>

                {/* Deviation - conditional color */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: getDeviationColor(row.deviation),
                    }}
                  >
                    {formatDeviation(row.deviation)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </CardSmall>
  );
}

export default CrewFairnessTable;
