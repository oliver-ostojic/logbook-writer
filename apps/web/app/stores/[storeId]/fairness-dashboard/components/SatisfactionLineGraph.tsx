'use client';

import React, { useState } from 'react';

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
  const chartHeight = 160;
  const pointCount = data.length;
  
  // Use same spacing logic as GraphCardSimple bars
  const gapRatio = 0.3;
  const pointWidthPercent = 100 / ((pointCount + 2) + (pointCount - 1) * gapRatio);
  const gapPercent = pointWidthPercent * gapRatio;
  const sideGapPercent = pointWidthPercent;
  
  // Right edge for grid lines (same as bar chart)
  const rightEdgePercent = sideGapPercent + pointCount * (pointWidthPercent + gapPercent) - gapPercent / 2;
  
  // Y-axis range: 0-100 for satisfaction percentage
  const yMin = 0;
  const yMax = 100;
  const yRange = yMax - yMin;
  const barScaleFactor = 0.9;
  
  // Calculate point positions (centered in each "bar slot")
  const points = data.map((d, i) => {
    const xPercent = sideGapPercent + i * (pointWidthPercent + gapPercent) + pointWidthPercent / 2;
    const y = chartHeight - ((d.satisfaction - yMin) / yRange) * chartHeight * barScaleFactor;
    return { x: xPercent, y, data: d };
  });
  
  // Calculate average satisfaction
  const avgSatisfaction = data.reduce((sum, d) => sum + d.satisfaction, 0) / data.length;
  const avgLineY = chartHeight - (avgSatisfaction / yRange) * chartHeight * barScaleFactor;

  return (
    <svg width="100%" height={chartHeight} style={{ overflow: 'visible' }}>
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
            x="0"
            y={y - 0.75}
            width="calc(100% - 50px)"
            height={1.5}
            fill="url(#lineHorizontalLineGradient)"
          />
        );
      })}
      
      {/* Y-axis labels on the right side (0, 50, 100) */}
      {[0, 0.5, 1].map((fraction) => {
        const y = chartHeight * (1 - fraction * barScaleFactor) - (chartHeight * (1 - barScaleFactor) / 2);
        const labelValue = Math.round(fraction * 100);
        return (
          <text
            key={`y-label-${fraction}`}
            x="100%"
            y={y}
            dominantBaseline="middle"
            textAnchor="end"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '16px',
              fontWeight: 350,
              fill: '#7C7F82',
            }}
          >
            {labelValue}
          </text>
        );
      })}
      
      {/* Vertical divider lines between points */}
      {Array.from({ length: pointCount - 1 }).map((_, i) => {
        const lineX = sideGapPercent + (i + 1) * (pointWidthPercent + gapPercent) - gapPercent / 2;
        return (
          <rect
            key={`divider-${i}`}
            x={`calc(${lineX}% - 0.75px)`}
            y={0}
            width={1.5}
            height={chartHeight}
            fill="url(#lineVerticalDividerGradient)"
          />
        );
      })}
      
      {/* Vertical line to the left of first point */}
      <rect
        x={`calc(${sideGapPercent - gapPercent / 2}% - 0.75px)`}
        y={0}
        width={1.5}
        height={chartHeight}
        fill="url(#lineVerticalDividerGradient)"
      />
      
      {/* Vertical line to the right of last point */}
      <rect
        x="calc(100% - 50px - 0.75px)"
        y={0}
        width={1.5}
        height={chartHeight}
        fill="url(#lineVerticalDividerGradient)"
      />
      
      {/* Area fill under the line */}
      {points.length > 1 && (
        <path
          d={`M ${points[0].x}% ${chartHeight} L ${points.map(p => `${p.x}% ${p.y}`).join(' L ')} L ${points[points.length - 1].x}% ${chartHeight} Z`}
          fill="url(#areaGradient)"
        />
      )}
      
      {/* Line segments connecting points */}
      {points.length > 1 && points.slice(0, -1).map((p, i) => {
        const nextP = points[i + 1];
        return (
          <line
            key={`segment-${i}`}
            x1={`${p.x}%`}
            y1={p.y}
            x2={`${nextP.x}%`}
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
            cx={`${p.x}%`}
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
        // Calculate column boundaries (from divider to divider)
        const leftEdge = i === 0 
          ? sideGapPercent - gapPercent / 2 
          : sideGapPercent + i * (pointWidthPercent + gapPercent) - gapPercent / 2;
        const rightEdge = i === points.length - 1
          ? sideGapPercent + (i + 1) * (pointWidthPercent + gapPercent) - gapPercent / 2
          : sideGapPercent + (i + 1) * (pointWidthPercent + gapPercent) - gapPercent / 2;
        const columnWidth = rightEdge - leftEdge;
        
        return (
          <rect
            key={`hover-col-${i}`}
            x={`${leftEdge}%`}
            y={0}
            width={`${columnWidth}%`}
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
          const xPercent = progressPercent * rightEdgePercent;
          
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
              x={`calc(${xPercent}% - ${dashWidth / 2}px)`}
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
        x="0%"
        y={avgLineY}
        dominantBaseline="middle"
        textAnchor="start"
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '16px',
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
        <span 
          className="text-med" 
          style={{ 
            fontFamily: 'var(--font-open-sans)', 
            color: '#DBDADB', 
            fontWeight: 350 
          }}
        >
          {title}
        </span>
      </div>
      
      {/* Chart */}
      <div className="flex-1 flex items-center justify-center">
        <SatisfactionLineChart 
          data={data}
          hoveredIndex={hoveredIndex}
          onHover={setHoveredIndex}
        />
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
