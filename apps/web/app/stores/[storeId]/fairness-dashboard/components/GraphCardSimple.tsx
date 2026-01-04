'use client';

import React, { useState } from 'react';

interface PreferenceBarData {
  label: string;
  totalCount: number;  // Total crew who selected this preference
  satisfiedCount: number;  // How many were satisfied
}

// Format number with K, M, B suffixes for thousands, millions, billions
function formatNumber(value: number): string {
  if (value >= 1_000_000_000) {
    const formatted = value / 1_000_000_000;
    return Number.isInteger(formatted) ? `${formatted}B` : `${formatted.toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    const formatted = value / 1_000_000;
    return Number.isInteger(formatted) ? `${formatted}M` : `${formatted.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const formatted = value / 1_000;
    return Number.isInteger(formatted) ? `${formatted}K` : `${formatted.toFixed(1)}K`;
  }
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

// Stacked bar chart - each bar shows satisfied vs not satisfied for a preference
function PreferenceStackedBars({ 
  data, 
  hoveredIndex, 
  onHover 
}: { 
  data: PreferenceBarData[];
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  const maxCount = Math.max(...data.map(d => d.totalCount));
  const chartHeight = 160;
  const barCount = data.length;
  
  // Bars scale to 90% of chart height, leaving 10% gap above
  const barScaleFactor = 0.9;
  
  // Calculate average of satisfied counts (bottom bars)
  const avgSatisfiedCount = data.reduce((sum, d) => sum + d.satisfiedCount, 0) / barCount;
  // Position as percentage of max (same scale as bars)
  const avgLineY = chartHeight - (avgSatisfiedCount / maxCount) * chartHeight * barScaleFactor;
  
  // Calculate bar width and gap to fill 100% width
  // We want: sideGap + bars + gaps between bars + sideGap = 100%
  // Where sideGap = barWidth (gap on each side equals one bar width)
  // So: 2*barWidth + barCount*barWidth + (barCount-1)*gap = 100%
  // With gap as a ratio of barWidth (e.g., gap = 0.3 * barWidth):
  const gapRatio = 0.3; // gap is 30% of bar width
  // (barCount + 2) * barWidth + (barCount - 1) * gapRatio * barWidth = 100
  // barWidth * ((barCount + 2) + (barCount - 1) * gapRatio) = 100
  const barWidthPercent = 100 / ((barCount + 2) + (barCount - 1) * gapRatio);
  const gapPercent = barWidthPercent * gapRatio;
  const sideGapPercent = barWidthPercent; // side gap equals one bar width
  
  return (
    <svg width="100%" height={chartHeight} style={{ overflow: 'visible' }}>
      <defs>
        {/* Satisfied (bottom) - opaque, smooth gradient */}
        <linearGradient id="satisfiedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A09FA3" />
          <stop offset="100%" stopColor="#6A696D" />
        </linearGradient>
        {/* Not satisfied (top) - dimmer, translucent */}
        <linearGradient id="notSatisfiedGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.05} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.15} />
        </linearGradient>
        {/* Gradient for vertical divider lines - fades at top and bottom */}
        <linearGradient id="verticalDividerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="2%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="40%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="60%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="98%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="100%" stopColor="#7C7F82" stopOpacity={0} />
        </linearGradient>
        {/* Gradient for horizontal grid lines - fades at left and right edges */}
        <linearGradient id="horizontalLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C7F82" stopOpacity={0} />
          <stop offset="8%" stopColor="#7C7F82" stopOpacity={0.19} />
          <stop offset="92%" stopColor="#7C7F82" stopOpacity={0.19} />
          <stop offset="100%" stopColor="#7C7F82" stopOpacity={0} />
        </linearGradient>
        {/* Gradient for average dashed line - fades at left and right edges */}
        <linearGradient id="avgLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C3C3CB" stopOpacity={0} />
          <stop offset="15%" stopColor="#C3C3CB" stopOpacity={1} />
          <stop offset="85%" stopColor="#C3C3CB" stopOpacity={1} />
          <stop offset="100%" stopColor="#C3C3CB" stopOpacity={0} />
        </linearGradient>
      </defs>
      
      {/* Horizontal grid lines (5 lines at 0%, 25%, 50%, 75%, 100% of chart height) */}
      {(() => {
        return [0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
          const y = chartHeight * (1 - fraction);
          return (
            <rect
              key={`hline-${i}`}
              x="0"
              y={y - 0.75}
              width="calc(100% - 50px)"
              height={1.5}
              fill="url(#horizontalLineGradient)"
            />
          );
        });
      })()}
      
      {/* Vertical divider lines between bars */}
      {Array.from({ length: barCount - 1 }).map((_, i) => {
        const lineX = sideGapPercent + (i + 1) * (barWidthPercent + gapPercent) - gapPercent / 2;
        return (
          <rect
            key={`divider-${i}`}
            x={`calc(${lineX}% - 0.75px)`}
            y={0}
            width={1.5}
            height={chartHeight}
            fill="url(#verticalDividerGradient)"
          />
        );
      })}
      
      {/* Vertical line to the left of first bar */}
      <rect
        x={`calc(${sideGapPercent - gapPercent / 2}% - 0.75px)`}
        y={0}
        width={1.5}
        height={chartHeight}
        fill="url(#verticalDividerGradient)"
      />
      
      {/* Vertical line to the right of last bar */}
      <rect
        x="calc(100% - 50px - 0.75px)"
        y={0}
        width={1.5}
        height={chartHeight}
        fill="url(#verticalDividerGradient)"
      />
      
      {data.map((item, index) => {
        const xPercent = sideGapPercent + index * (barWidthPercent + gapPercent);
        // Scale bars using barScaleFactor (80% of chart height)
        const totalHeight = (item.totalCount / maxCount) * chartHeight * barScaleFactor;
        const satisfiedHeight = (item.satisfiedCount / item.totalCount) * totalHeight;
        const notSatisfiedHeight = totalHeight - satisfiedHeight;
        
        // Position from bottom
        const satisfiedY = chartHeight - satisfiedHeight;
        const notSatisfiedY = chartHeight - totalHeight;
        
        // Top bar extends into the bottom bar's corner curve area
        const cornerRadius = 13;
        const clipId = `clipTop${index}`;
        
        const isHovered = hoveredIndex === index;
        
        // Calculate column bounds (includes half gap on each side for easier hovering)
        const columnStart = index === 0 
          ? sideGapPercent - gapPercent / 2 
          : xPercent - gapPercent / 2;
        const columnEnd = index === data.length - 1
          ? xPercent + barWidthPercent + gapPercent / 2
          : xPercent + barWidthPercent + gapPercent / 2;
        const columnWidth = columnEnd - columnStart;
        
        return (
          <g 
            key={index}
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
            style={{ cursor: 'pointer', opacity: hoveredIndex === null || isHovered ? 1 : 0.5, transition: 'opacity 0.15s ease' }}
          >
            {/* Invisible hover area covering full column */}
            <rect
              x={`${columnStart}%`}
              y={0}
              width={`${columnWidth}%`}
              height={chartHeight}
              fill="transparent"
            />
            {/* Clip path - extends down to where bottom bar corners start curving */}
            <clipPath id={clipId}>
              <rect
                x={`${xPercent}%`}
                y={notSatisfiedY}
                width={`${barWidthPercent}%`}
                height={notSatisfiedHeight + cornerRadius}
              />
            </clipPath>
            {/* Not satisfied portion (top) - clipped so bottom is square, fills corner gap */}
            <rect
              x={`${xPercent}%`}
              y={notSatisfiedY}
              width={`${barWidthPercent}%`}
              height={notSatisfiedHeight + cornerRadius + 13}
              rx={13}
              ry={13}
              fill="url(#notSatisfiedGradient)"
              clipPath={`url(#${clipId})`}
            />
            {/* Satisfied portion (bottom) */}
            <rect
              x={`${xPercent}%`}
              y={satisfiedY}
              width={`${barWidthPercent}%`}
              height={satisfiedHeight}
              rx={13}
              ry={13}
              fill="url(#satisfiedGradient)"
            />
          </g>
        );
      })}
      
      {/* Average line - dashed with pill-shaped dashes (drawn last to be on top) */}
      {(() => {
        const dashWidth = 8;
        const dashGap = 8;
        const dashHeight = 1.5;
        const dashSpacing = dashWidth + dashGap; // 16px per dash+gap
        
        // Right edge line position only (left extends to 0%)
        const rightEdgePercent = sideGapPercent + barCount * (barWidthPercent + gapPercent) - gapPercent / 2;
        
        const numDashes = 40;
        return Array.from({ length: numDashes }).map((_, i) => {
          // Position dashes from 0% to right edge
          const progressPercent = i / (numDashes - 1);
          const xPercent = progressPercent * rightEdgePercent;
          
          // Calculate opacity - first 5% invisible, then fade from 5-25%, full from 25-75%, fade out 75-95%, invisible 95-100%
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
              ry={dashHeight / 2}
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
      
      {/* Y-axis labels on the right side (0, middle, max) */}
      {[0, 0.5, 1].map((chartFraction) => {
        // Position at chart fraction (0%, 50%, 100% of chart height)
        const y = chartHeight * (1 - chartFraction);
        // Convert chart position to actual value on bar scale
        // If barScaleFactor = 0.9, then 90% of chart = maxCount
        // So chartFraction of chart = (chartFraction / barScaleFactor) * maxCount
        const value = (chartFraction / barScaleFactor) * maxCount;
        const displayValue = formatNumber(value);
        return (
          <text
            key={`y-label-${chartFraction}`}
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
            {displayValue}
          </text>
        );
      })}
    </svg>
  );
}

interface GraphCardSimpleProps {
  title: string;
  preferenceData?: PreferenceBarData[];
  children?: React.ReactNode;
}

export function GraphCardSimple({ 
  title, 
  preferenceData,
  children 
}: GraphCardSimpleProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // Calculate right edge position for legend alignment (matches graph calculation)
  const barCount = preferenceData?.length || 7;
  const gapRatio = 0.3;
  const barWidthPercent = 100 / ((barCount + 2) + (barCount - 1) * gapRatio);
  const gapPercent = barWidthPercent * gapRatio;
  const sideGapPercent = barWidthPercent;
  const rightEdgePercent = sideGapPercent + barCount * (barWidthPercent + gapPercent) - gapPercent / 2;

  // Get the hovered preference label
  const hoveredLabel = hoveredIndex !== null && preferenceData 
    ? preferenceData[hoveredIndex].label 
    : null;

  return (
    <div 
      className="flex flex-col"
      style={{ 
        backgroundColor: 'transparent',
        borderRadius: '1rem', 
        padding: '1rem',
        minHeight: 200,
      }}
    >
      {/* Title row with legend */}
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
        
        {/* Legend - positioned to align with right edge of graph */}
        {preferenceData && (
          <div 
            className="flex gap-4 ml-auto"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '16px',
              fontWeight: 350,
              color: '#7C7F82',
              marginRight: `${100 - rightEdgePercent}%`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <div 
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: 'linear-gradient(to bottom, #A09FA3, #6A696D)',
                }}
              />
              <span>Met</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div 
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: 'linear-gradient(to top, rgba(255,255,255,0.05), rgba(255,255,255,0.15))',
                }}
              />
              <span>Not met</span>
            </div>
          </div>
        )}
      </div>

      {/* Graph area */}
      <div className="flex-1 flex items-center justify-center">
        {preferenceData && (
          <PreferenceStackedBars 
            data={preferenceData} 
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
        )}
        {children}
      </div>
      
      {/* Hovered preference label */}
      <div 
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '14px',
          fontWeight: 350,
          color: '#7C7F82',
          height: '12px',
          marginTop: '10px',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            opacity: hoveredLabel ? 1 : 0,
            transition: 'opacity 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {hoveredLabel}
        </span>
      </div>
    </div>
  );
}
