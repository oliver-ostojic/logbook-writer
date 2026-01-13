'use client';

import React, { useState } from 'react';

// AI Glass style helpers
const aiGlassBorderStyle = (borderRadius: string | number = '1.5rem'): React.CSSProperties => ({
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
  position: 'relative' as const,
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
});

const aiGlassContentStyle = (borderRadius: string | number = '1.5rem', opacity: number = 0.85): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  background: `rgba(28, 27, 31, ${opacity})`,
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
});

interface ShiftSatisfactionData {
  shiftNumber: number;
  shiftDate?: string; // Optional date string like "1 Jun, 25"
  satisfaction: number; // 0-100
}

interface SatisfactionLineGraphProps {
  title: string;
  data: ShiftSatisfactionData[];
}

function SatisfactionLineChart({
  data,
  hoveredIndex,
  onHover
}: {
  data: ShiftSatisfactionData[];
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  const chartHeight = 220; // Match GraphCardSimple height
  const viewBoxWidth = 1000;
  const pointCount = data.length;

  // Symmetric margins INSIDE the SVG like GraphCardSimple
  const graphLeftEdge = 28; // Left margin inside SVG
  const graphRightEdge = viewBoxWidth - 28; // Right margin inside SVG (symmetric)
  const chartWidth = graphRightEdge - graphLeftEdge;

  // Use same spacing logic as GraphCardSimple bars
  const gapRatio = 0.3;
  const pointWidth = chartWidth / ((pointCount + 2) + (pointCount - 1) * gapRatio);
  const gap = pointWidth * gapRatio;
  const sideGap = pointWidth;

  // Right edge for average line (extends to graph right edge)
  const rightEdge = sideGap + pointCount * (pointWidth + gap) - gap / 2;

  // Y-axis range: 0-100 for satisfaction percentage
  const yMin = 0;
  const yMax = 100;
  const yRange = yMax - yMin;
  const barScaleFactor = 0.9;

  // Calculate point positions (centered in each "bar slot")
  const points = data.map((d, i) => {
    const x = graphLeftEdge + sideGap + i * (pointWidth + gap) + pointWidth / 2;
    const y = chartHeight - ((d.satisfaction - yMin) / yRange) * chartHeight * barScaleFactor;
    return { x, y, data: d };
  });

  // Calculate average satisfaction
  const avgSatisfaction = data.reduce((sum, d) => sum + d.satisfaction, 0) / data.length;
  const avgLineY = chartHeight - (avgSatisfaction / yRange) * chartHeight * barScaleFactor;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxWidth} ${chartHeight}`} style={{ overflow: 'visible' }}>
      <defs>
        {/* Gradient for the line */}
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A09FA3" />
          <stop offset="100%" stopColor="#6A696D" />
        </linearGradient>
        
        {/* Gradient for the area fill */}
        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.02} />
        </linearGradient>
        
        {/* Gradient for vertical divider lines - fades at top and bottom (same as bar chart) */}
        <linearGradient id="lineVerticalDividerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="2%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="40%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="60%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="98%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="100%" stopColor="#7C7F82" stopOpacity={0} />
        </linearGradient>
        
        {/* Gradient for horizontal grid lines - fades at left and right edges (same as bar chart) */}
        <linearGradient id="lineHorizontalLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="8%" stopColor="#7C7F82" stopOpacity={0.19} />
          <stop offset="92%" stopColor="#7C7F82" stopOpacity={0.19} />
          <stop offset="100%" stopColor="#7C7F82" stopOpacity={0} />
        </linearGradient>
      </defs>
      
      {/* Horizontal grid lines (3 lines at 0%, 50%, 100%) */}
      {[0, 0.5, 1].map((fraction, i) => {
        const y = chartHeight * (1 - fraction * barScaleFactor) - (chartHeight * (1 - barScaleFactor) / 2);
        return (
          <rect
            key={`hline-${i}`}
            x={graphLeftEdge}
            y={y - 1.25}
            width={chartWidth}
            height={2.5}
            fill="url(#lineHorizontalLineGradient)"
          />
        );
      })}
      
      {/* Vertical divider lines between points */}
      {Array.from({ length: pointCount - 1 }).map((_, i) => {
        const lineX = graphLeftEdge + sideGap + (i + 1) * (pointWidth + gap) - gap / 2;
        return (
          <rect
            key={`divider-${i}`}
            x={lineX - 1.25}
            y={0}
            width={2.5}
            height={chartHeight}
            fill="url(#lineVerticalDividerGradient)"
          />
        );
      })}

      {/* Vertical line to the left of first point */}
      <rect
        x={graphLeftEdge + sideGap - gap / 2 - 1.25}
        y={0}
        width={2.5}
        height={chartHeight}
        fill="url(#lineVerticalDividerGradient)"
      />

      {/* Vertical line to the right of last point */}
      <rect
        x={graphLeftEdge + sideGap + pointCount * (pointWidth + gap) - gap / 2 - 1.25}
        y={0}
        width={2.5}
        height={chartHeight}
        fill="url(#lineVerticalDividerGradient)"
      />
      
      {/* Area fill under the line */}
      {points.length > 1 && (
        <path
          d={`M ${points[0].x} ${chartHeight} L ${points.map(p => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1].x} ${chartHeight} Z`}
          fill="url(#areaGradient)"
        />
      )}
      
      {/* Line segments connecting points */}
      {points.length > 1 && points.slice(0, -1).map((p, i) => {
        const nextP = points[i + 1];
        return (
          <line
            key={`segment-${i}`}
            x1={p.x}
            y1={p.y}
            x2={nextP.x}
            y2={nextP.y}
            stroke="#6A696D"
            strokeWidth={5}
            strokeLinecap="round"
          />
        );
      })}
      
      {/* Data points - hollow with border */}
      {points.map((p, i) => (
        <g key={`point-${i}`}>
          {/* Visible dot - hollow with border */}
          <circle
            cx={p.x}
            cy={p.y}
            r={hoveredIndex === i ? 8 : 7}
            fill="#262628"
            stroke={hoveredIndex === i ? '#FFFFFF' : '#6A696D'}
            strokeWidth={4}
            style={{
              transition: 'all 0.15s ease',
              pointerEvents: 'none',
            }}
          />
        </g>
      ))}
      
      {/* Invisible hover columns - full height for easier hover detection */}
      {points.map((p, i) => {
        // Calculate column boundaries (from divider to divider) - all equal width
        const leftEdge = graphLeftEdge + sideGap + i * (pointWidth + gap) - gap / 2;
        const colRightEdge = graphLeftEdge + sideGap + (i + 1) * (pointWidth + gap) - gap / 2;
        const columnWidth = colRightEdge - leftEdge;

        return (
          <rect
            key={`hover-col-${i}`}
            x={leftEdge}
            y={0}
            width={columnWidth}
            height={chartHeight}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
      
      {/* Average line - dashed with pill-shaped dashes */}
      {(() => {
        const dashWidth = 8;
        const dashHeight = 1.5;
        const numDashes = 40;

        return Array.from({ length: numDashes }).map((_, i) => {
          const progressPercent = i / (numDashes - 1);
          const xPos = graphLeftEdge + progressPercent * (rightEdge - graphLeftEdge);
          
          // Calculate opacity - fade in and out at edges
          let opacity = 0.6;
          if (progressPercent < 0.05) {
            opacity = 0;
          } else if (progressPercent < 0.25) {
            opacity = ((progressPercent - 0.05) / 0.20) * 0.6;
          } else if (progressPercent > 0.95) {
            opacity = 0;
          } else if (progressPercent > 0.75) {
            opacity = ((0.95 - progressPercent) / 0.20) * 0.6;
          }
          
          return (
            <rect
              key={`dash-${i}`}
              x={xPos - dashWidth / 2}
              y={avgLineY - dashHeight / 2}
              width={dashWidth}
              height={dashHeight}
              rx={dashHeight / 2}
              fill="#C3C3CB"
              opacity={opacity}
            />
          );
        });
      })()}
      
      {/* "avg" label to the left of the average line */}
      <text
        x="0"
        y={avgLineY}
        dominantBaseline="middle"
        textAnchor="start"
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '24px',
          fontWeight: 350,
          fill: '#7C7F82',
        }}
      >
        avg
      </text>
    </svg>
  );
}

export function SatisfactionLineGraph({ title, data }: SatisfactionLineGraphProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Get hovered data point info
  const hoveredData = hoveredIndex !== null ? data[hoveredIndex] : null;

  // Y-axis labels (0, 50, 100)
  const chartHeight = 220; // Match the SVG chart height
  const barScaleFactor = 0.9;
  const yLabels = [0, 0.5, 1].map((fraction) => {
    const y = chartHeight * (1 - fraction * barScaleFactor) - (chartHeight * (1 - barScaleFactor) / 2);
    const labelValue = Math.round(fraction * 100);
    return { y, value: labelValue };
  });

  return (
    <div
      className="flex flex-col relative overflow-hidden"
      style={{
        backgroundColor: 'transparent',
        borderRadius: '1rem',
        padding: '1rem',
        minHeight: 200,
      }}
    >
      {/* Title row */}
      <div className="mb-4 flex items-center">
        <div className="ai-glass-border" style={{ ...aiGlassBorderStyle('9999px'), display: 'inline-block' }}>
          <div
            style={{
              ...aiGlassContentStyle('9999px'),
              padding: '6px 14px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 500,
              color: '#DBDADB',
            }}
          >
            {title}
          </div>
        </div>
      </div>

      {/* Chart area - two column layout like GraphCardSimple */}
      <div className="flex-1 flex items-stretch" style={{ gap: '16px' }}>
        {/* Left column: Graph (stretches) */}
        <div className="flex-1">
          <SatisfactionLineChart
            data={data}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
        </div>

        {/* Right column: Y-axis labels (fixed width) - EXACTLY like GraphCardSimple */}
        <div className="relative flex-shrink-0" style={{ width: '40px', paddingLeft: '8px', paddingRight: '8px' }}>
          {yLabels.map((label) => (
            <div
              key={`y-label-${label.value}`}
              className="absolute"
              style={{
                top: `${(label.y / chartHeight) * 100}%`,
                transform: 'translateY(-50%)',
                right: '8px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '16px',
                fontWeight: 350,
                color: '#7C7F82',
                textAlign: 'right',
              }}
            >
              {label.value}%
            </div>
          ))}
        </div>
      </div>

      {/* Hovered point info */}
      <div
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '14px',
          fontWeight: 350,
          color: '#7C7F82',
          height: '12px',
          marginTop: '2px',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            opacity: hoveredData ? 1 : 0,
            transition: 'opacity 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {hoveredData && `${hoveredData.shiftDate || `Shift ${hoveredData.shiftNumber}`} — ${hoveredData.satisfaction.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
}
