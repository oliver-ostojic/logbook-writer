'use client';

import React, { useState } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface PreferenceBarData {
  label: string;
  description?: string;  // Optional description from roleRule
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

// Calculate "nice" whole number ticks for y-axis
function calculateNiceTicks(maxValue: number, targetTickCount: number = 5): number[] {
  if (maxValue <= 0) return [0];

  // Find a nice step size (1, 2, 5, 10, 20, 50, etc.)
  const roughStep = maxValue / (targetTickCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;

  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3) niceStep = 2 * magnitude;
  else if (residual <= 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  // Generate ticks from 0 up to (and including) a value >= maxValue
  const ticks: number[] = [];
  for (let tick = 0; tick <= maxValue; tick += niceStep) {
    ticks.push(tick);
  }
  // Ensure we include a tick at or above maxValue
  if (ticks[ticks.length - 1] < maxValue) {
    ticks.push(ticks[ticks.length - 1] + niceStep);
  }

  return ticks;
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
  const maxCount = Math.max(...data.map(d => d.totalCount), 1); // Ensure at least 1 to avoid division by zero

  // Calculate nice ticks and use tickMax for scaling
  const ticks = calculateNiceTicks(maxCount, 4);
  const tickMax = ticks[ticks.length - 1];

  // Use viewBox for responsive scaling - all calculations in fixed coordinates
  const viewBoxWidth = 1000;
  const viewBoxHeight = 220;
  const barCount = data.length;

  // Bars scale to 90% of chart height, leaving 10% gap above
  const barScaleFactor = 0.9;

  // Calculate average of satisfied counts (bottom bars)
  const avgSatisfiedCount = data.reduce((sum, d) => sum + d.satisfiedCount, 0) / Math.max(barCount, 1);
  // Position as percentage of tickMax (same scale as bars)
  const avgLineY = viewBoxHeight - (avgSatisfiedCount / tickMax) * viewBoxHeight * barScaleFactor;

  // Graph extends more to the right to reduce left margin
  const graphLeftEdge = 28; // Left margin
  const graphRightEdge = viewBoxWidth - 10; // Smaller right margin - graph extends further right
  const chartWidth = graphRightEdge - graphLeftEdge; // Bars fill from graphLeftEdge to graphRightEdge

  // Calculate bar width and gap to fill chart width
  // We want: sideGap + bars + gaps (between bars + right side) = chartWidth
  // Where sideGap = barWidth, and we have barCount full gaps (barCount-1 between + 1 on right)
  const gapRatio = 0.3; // gap is 30% of bar width
  const barWidth = chartWidth / ((barCount + 1) + barCount * gapRatio);
  const gap = barWidth * gapRatio;
  const sideGap = barWidth;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} style={{ overflow: 'visible' }}>
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
      
      {/* Horizontal grid lines - match y-axis tick positions */}
      {ticks.map((tickValue, i) => {
        const y = viewBoxHeight - (tickValue / tickMax) * viewBoxHeight * barScaleFactor;
        return (
          <rect
            key={`hline-${i}`}
            x={graphLeftEdge}
            y={y - 1.25}
            width={chartWidth}
            height={2.5}
            fill="url(#horizontalLineGradient)"
          />
        );
      })}
      
      {/* Vertical divider lines between bars */}
      {Array.from({ length: barCount - 1 }).map((_, i) => {
        const lineX = graphLeftEdge + sideGap + (i + 1) * (barWidth + gap) - gap / 2;
        return (
          <rect
            key={`divider-${i}`}
            x={lineX - 1.25}
            y={viewBoxHeight * (1 - barScaleFactor)}
            width={2.5}
            height={viewBoxHeight * barScaleFactor}
            fill="url(#verticalDividerGradient)"
          />
        );
      })}

      {/* Vertical line to the left of first bar */}
      <rect
        x={graphLeftEdge + sideGap - gap / 2 - 1.25}
        y={viewBoxHeight * (1 - barScaleFactor)}
        width={2.5}
        height={viewBoxHeight * barScaleFactor}
        fill="url(#verticalDividerGradient)"
      />

      {/* Vertical line to the right of last bar */}
      <rect
        x={graphRightEdge - gap / 2 - 1.25}
        y={viewBoxHeight * (1 - barScaleFactor)}
        width={2.5}
        height={viewBoxHeight * barScaleFactor}
        fill="url(#verticalDividerGradient)"
      />
      
      {data.map((item, index) => {
        const x = graphLeftEdge + sideGap + index * (barWidth + gap);

        // Safety check: ensure counts are non-negative and totalCount > 0
        const totalCount = Math.max(item.totalCount, 0);
        const satisfiedCount = Math.max(Math.min(item.satisfiedCount, totalCount), 0); // Clamp between 0 and totalCount

        // Scale bars using barScaleFactor (90% of chart height) and tickMax for alignment
        const totalHeight = totalCount > 0 ? (totalCount / tickMax) * viewBoxHeight * barScaleFactor : 0;
        const satisfiedHeight = totalCount > 0 ? (satisfiedCount / totalCount) * totalHeight : 0;
        const notSatisfiedHeight = Math.max(totalHeight - satisfiedHeight, 0); // Ensure non-negative

        // Position from bottom - ensure we never go below the baseline
        const satisfiedY = Math.max(0, viewBoxHeight - satisfiedHeight);
        const notSatisfiedY = Math.max(0, viewBoxHeight - totalHeight);

        // Minimum height threshold for rendering (avoid rendering tiny slivers)
        const minRenderHeight = 2;
        const shouldRenderSatisfied = satisfiedHeight >= minRenderHeight;
        const shouldRenderNotSatisfied = notSatisfiedHeight >= minRenderHeight;

        const cornerRadius = 13;
        const clipId = `clipTop${index}`;

        const isHovered = hoveredIndex === index;

        // Calculate column bounds (includes half gap on each side for easier hovering)
        const columnStart = index === 0
          ? graphLeftEdge + sideGap - gap / 2
          : x - gap / 2;
        const columnEnd = index === data.length - 1
          ? graphRightEdge - gap / 2
          : x + barWidth + gap / 2;
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
              x={columnStart}
              y={0}
              width={columnWidth}
              height={viewBoxHeight}
              fill="transparent"
            />

            {/* Not satisfied portion - full bar from top of total down to baseline */}
            {totalHeight > 0 && (
              <rect
                x={x}
                y={notSatisfiedY}
                width={barWidth}
                height={viewBoxHeight - notSatisfiedY}
                rx={13}
                ry={13}
                fill="url(#notSatisfiedGradient)"
              />
            )}

            {/* Satisfied portion (bottom) - render on top so it covers the not satisfied bar */}
            {shouldRenderSatisfied && (
              <rect
                x={x}
                y={satisfiedY}
                width={barWidth}
                height={satisfiedHeight}
                rx={13}
                ry={13}
                fill="url(#satisfiedGradient)"
              />
            )}
          </g>
        );
      })}
      
      {/* Average line - dashed with pill-shaped dashes (drawn last to be on top) */}
      {(() => {
        const dashWidth = 8;
        const dashGap = 8;
        const dashHeight = 1.5;

        const numDashes = 40;
        return Array.from({ length: numDashes }).map((_, i) => {
          // Position dashes from graphLeftEdge to graphRightEdge
          const progress = i / (numDashes - 1);
          const xPos = graphLeftEdge + progress * chartWidth;

          // Calculate opacity - first 5% invisible, then fade from 5-25%, full from 25-75%, fade out 75-95%, invisible 95-100%
          let opacity = 0.6;
          if (progress < 0.05) {
            opacity = 0;
          } else if (progress < 0.25) {
            opacity = ((progress - 0.05) / 0.20) * 0.6;
          } else if (progress > 0.95) {
            opacity = 0;
          } else if (progress > 0.75) {
            opacity = ((0.95 - progress) / 0.20) * 0.6;
          }

          return (
            <rect
              key={`dash-${i}`}
              x={xPos - dashWidth / 2}
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
        x={graphLeftEdge - 8}
        y={avgLineY}
        dominantBaseline="middle"
        textAnchor="end"
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

  // Calculate right edge position for legend alignment
  const viewBoxWidth = 600;
  const viewBoxHeight = 220;
  const barScaleFactor = 0.9;
  const graphRightEdge = viewBoxWidth - 28; // Symmetric margins
  const rightEdgePercent = (graphRightEdge / viewBoxWidth) * 100;

  // Get the hovered preference description (or label as fallback)
  const hoveredText = hoveredIndex !== null && preferenceData
    ? (preferenceData[hoveredIndex].description || preferenceData[hoveredIndex].label)
    : null;

  // Calculate ticks for y-axis labels
  const maxCount = preferenceData ? Math.max(...preferenceData.map(d => d.totalCount), 1) : 1;
  const ticks = calculateNiceTicks(maxCount, 4);
  const tickMax = ticks[ticks.length - 1];

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
        <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08), display: 'inline-block' }}>
          <div
            style={{
              ...aiGlassLightContentStyle('9999px', 0.6),
              padding: '6px 14px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 500,
              color: '#2C2C2C',
            }}
          >
            {title}
          </div>
        </div>
        
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

      {/* Graph area - two column layout */}
      <div className="flex-1 flex items-stretch" style={{ gap: '16px' }}>
        {/* Left column: Graph (stretches) */}
        <div className="flex-1">
          {preferenceData && (
            <PreferenceStackedBars
              data={preferenceData}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
            />
          )}
          {children}
        </div>

        {/* Right column: Y-axis labels (fixed width) */}
        {preferenceData && (
          <div className="relative flex-shrink-0" style={{ width: '40px', paddingLeft: '8px', paddingRight: '8px' }}>
            {ticks.map((tickValue) => {
              // Calculate y position (same logic as horizontal grid lines)
              const yPercent = (1 - (tickValue / tickMax) * barScaleFactor) * 100;

              return (
                <div
                  key={`y-label-${tickValue}`}
                  className="absolute"
                  style={{
                    top: `${yPercent}%`,
                    transform: 'translateY(-50%)',
                    right: '8px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '15px',
                    fontWeight: 350,
                    color: '#7C7F82',
                    textAlign: 'right',
                  }}
                >
                  {formatNumber(tickValue)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Hovered preference description */}
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
            opacity: hoveredText ? 1 : 0,
            transition: 'opacity 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {hoveredText}
        </span>
      </div>
    </div>
  );
}
