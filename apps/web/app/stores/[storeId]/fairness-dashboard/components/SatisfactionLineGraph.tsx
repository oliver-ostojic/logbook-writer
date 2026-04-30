'use client';

import React, { useState, useEffect } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface ShiftSatisfactionData {
  shiftNumber: number;
  shiftDate?: string; // Optional date string like "1 Jun, 25"
  satisfaction: number; // 0-100
}

interface SatisfactionLineGraphProps {
  title?: string;  // Made optional since title now rendered by LargeGraphCard
  data: ShiftSatisfactionData[];
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  onActiveDataChange?: (data: ShiftSatisfactionData | null) => void; // Callback for active data
  onActiveLabelChange?: (label: string | null) => void; // Callback for active date label
}

interface YAxisConfig {
  yMin: number;
  yMax: number;
  yRange: number;
  ticks: number[];
}

// Simple seeded random number generator for consistent gradients across renders
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate random gradient stops for a line
function generateRandomGradient(seed: number): Array<{ offset: number; opacity: number }> {
  const stops: Array<{ offset: number; opacity: number }> = [];

  // Always start and end at 0 opacity for edge fading
  stops.push({ offset: 0, opacity: 0 });

  // Generate 5-7 random stops in between
  const numStops = Math.floor(seededRandom(seed) * 3) + 5; // 5-7 stops

  for (let i = 1; i < numStops - 1; i++) {
    // Generate random position between 0-100, avoiding edges
    const position = seededRandom(seed + i * 100) * 80 + 10; // 10-90%
    // Generate random opacity (0.04-0.18 range for subtle fading)
    const opacity = seededRandom(seed + i * 200) * 0.14 + 0.04;
    stops.push({ offset: position, opacity });
  }

  stops.push({ offset: 100, opacity: 0 });

  // Sort by offset
  stops.sort((a, b) => a.offset - b.offset);

  return stops;
}

// Calculate nice tick values for Y-axis
// First and last are rounded to nice numbers (for labels)
// Middle is exactly centered (no label, just visual)
function calculateNiceTicks(min: number, max: number, targetCount: number = 3): number[] {
  const range = max - min;
  if (range === 0) {
    // All values are the same, return single tick
    return [min];
  }

  // Determine nice step size for rounding first/last ticks
  const roughStep = range / 2;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;

  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3) niceStep = 2 * magnitude;
  else if (residual <= 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  // Round first and last to nice numbers
  const firstTick = Math.round(min / niceStep) * niceStep;
  const lastTick = Math.round(max / niceStep) * niceStep;

  // Middle tick is exactly halfway between first and last (for visual centering)
  const middleTick = (firstTick + lastTick) / 2;

  return [
    Math.round(firstTick * 100) / 100,
    Math.round(middleTick * 100) / 100,
    Math.round(lastTick * 100) / 100,
  ];
}

function SatisfactionLineChart({
  data,
  hoveredIndex,
  onHover,
  selectedIndex,
  onSelectIndex,
  isHoveringChart,
  onYAxisConfig,
  viewBoxWidth = 1000,
}: {
  data: ShiftSatisfactionData[];
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  isHoveringChart: boolean;
  onYAxisConfig?: (config: YAxisConfig) => void;
  viewBoxWidth?: number;
}) {
  const chartHeight = 220; // Match GraphCardSimple height
  const pointCount = data.length;

  // Margins INSIDE the SVG
  const graphLeftEdge = 28; // Left margin inside SVG
  const graphRightEdge = viewBoxWidth - 1; // Minimal right margin for tight spacing
  const chartWidth = graphRightEdge - graphLeftEdge;

  // Use same spacing logic as GraphCardSimple bars
  const gapRatio = 0.3;
  const pointWidth = chartWidth / ((pointCount + 2) + (pointCount - 1) * gapRatio);
  const gap = pointWidth * gapRatio;
  const sideGap = pointWidth;

  // Right edge for average line (extends to graph right edge)
  const rightEdge = sideGap + pointCount * (pointWidth + gap) - gap / 2;

  // Dynamic Y-axis range based on data
  const satisfactionValues = data.map(d => d.satisfaction).filter(v => !isNaN(v) && isFinite(v));

  // Guard against empty or invalid data
  if (satisfactionValues.length === 0) {
    return null; // Don't render chart if no valid data
  }

  const dataMin = Math.min(...satisfactionValues);
  const dataMax = Math.max(...satisfactionValues);
  const dataRange = dataMax - dataMin;

  // Add minimal padding so data has breathing room without excessive space
  const paddingAmount = dataRange > 0 ? dataRange * 0.15 : 3;
  const yMin = Math.max(0, Math.floor(dataMin - paddingAmount));
  const yMax = Math.min(100, Math.ceil(dataMax + paddingAmount));
  const yRange = yMax - yMin || 1; // Avoid division by zero

  // Calculate nice ticks for grid lines
  const ticks = calculateNiceTicks(yMin, yMax, 3);

  // Calculate tick step for consistent spacing
  const tickStep = ticks.length > 1 ? ticks[1] - ticks[0] : yRange * 0.3;

  // Extend Y-axis range by one tick step on each end (for invisible grid lines at edges)
  // This creates equal visual spacing at top and bottom
  const displayYMin = yMin - tickStep;
  const displayYMax = yMax + tickStep;
  const displayYRange = displayYMax - displayYMin;

  const barScaleFactor = 0.95;

  // Notify parent of Y-axis config (use display range for positioning)
  // Using JSON.stringify for stable comparison of ticks array
  const ticksKey = JSON.stringify(ticks);
  useEffect(() => {
    onYAxisConfig?.({ yMin: displayYMin, yMax: displayYMax, yRange: displayYRange, ticks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayYMin, displayYMax, displayYRange, ticksKey, onYAxisConfig]);

  // Mini sparkline styling constants - use smaller values for non-scaling strokes
  const dotRadius = 5;
  const dotStrokeWidth = 3.75; // 2.5 * 1.5 (50% thicker)
  const dotOuterRadius = dotRadius + dotStrokeWidth / 2; // Outer edge of the ring

  // Calculate point positions (centered in each "bar slot")
  const points = data.map((d, i) => {
    const x = graphLeftEdge + sideGap + i * (pointWidth + gap) + pointWidth / 2;
    const y = chartHeight - ((d.satisfaction - displayYMin) / displayYRange) * chartHeight * barScaleFactor;
    return { x, y, data: d };
  });

  // Calculate average satisfaction
  const avgSatisfaction = data.reduce((sum, d) => sum + d.satisfaction, 0) / data.length;
  const avgLineY = chartHeight - ((avgSatisfaction - displayYMin) / displayYRange) * chartHeight * barScaleFactor;

  // Calculate total number of vertical lines for gradient generation
  const numVerticalLines = pointCount + 1; // left edge + between points + right edge

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

        {/* Unique gradient for each horizontal grid line */}
        {ticks.map((_, i) => {
          const stops = generateRandomGradient(1000 + i); // Seed: 1000+ for horizontal
          return (
            <linearGradient key={`hgrad-${i}`} id={`horizontalLineGradient-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              {stops.map((stop, j) => (
                <stop key={j} offset={`${stop.offset}%`} stopColor="#7C7F82" stopOpacity={stop.opacity} />
              ))}
            </linearGradient>
          );
        })}

        {/* Unique gradient for each vertical divider line */}
        {Array.from({ length: numVerticalLines }).map((_, i) => {
          const stops = generateRandomGradient(2000 + i); // Seed: 2000+ for vertical
          return (
            <linearGradient key={`vgrad-${i}`} id={`verticalLineGradient-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              {stops.map((stop, j) => (
                <stop key={j} offset={`${stop.offset}%`} stopColor="#7C7F82" stopOpacity={stop.opacity} />
              ))}
            </linearGradient>
          );
        })}
      </defs>

      {/* Horizontal grid lines at tick positions */}
      {ticks.map((tickValue, i) => {
        const fraction = (tickValue - displayYMin) / displayYRange;
        const y = chartHeight - fraction * chartHeight * barScaleFactor;
        return (
          <rect
            key={`hline-${i}`}
            x={graphLeftEdge}
            y={y - 0.9375}
            width={chartWidth}
            height={1.875}
            fill={`url(#horizontalLineGradient-${i})`}
          />
        );
      })}

      {/* Vertical line to the left of first point */}
      <rect
        x={graphLeftEdge + sideGap - gap / 2 - 0.9375}
        y={0}
        width={1.875}
        height={chartHeight}
        fill="url(#verticalLineGradient-0)"
      />

      {/* Vertical divider lines between points */}
      {Array.from({ length: pointCount - 1 }).map((_, i) => {
        const lineX = graphLeftEdge + sideGap + (i + 1) * (pointWidth + gap) - gap / 2;
        return (
          <rect
            key={`divider-${i}`}
            x={lineX - 0.9375}
            y={0}
            width={1.875}
            height={chartHeight}
            fill={`url(#verticalLineGradient-${i + 1})`}
          />
        );
      })}

      {/* Vertical line to the right of last point */}
      <rect
        x={graphLeftEdge + sideGap + pointCount * (pointWidth + gap) - gap / 2 - 0.9375}
        y={0}
        width={1.875}
        height={chartHeight}
        fill={`url(#verticalLineGradient-${pointCount})`}
      />

      {/* Area fill under the line */}
      {points.length > 1 && (
        <path
          d={`M ${points[0].x} ${chartHeight} L ${points.map(p => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1].x} ${chartHeight} Z`}
          fill="url(#areaGradient)"
        />
      )}

      {/* Line segments connecting points - stop at circle outer edges */}
      {points.length > 1 && points.slice(0, -1).map((p, i) => {
        const nextP = points[i + 1];
        const dx = nextP.x - p.x;
        const dy = nextP.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return null;

        // Normalized direction vector
        const nx = dx / dist;
        const ny = dy / dist;

        // Shorten line segment by dotOuterRadius on each end
        const x1 = p.x + nx * dotOuterRadius;
        const y1 = p.y + ny * dotOuterRadius;
        const x2 = nextP.x - nx * dotOuterRadius;
        const y2 = nextP.y - ny * dotOuterRadius;

        return (
          <line
            key={`segment-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#464548"
            strokeWidth={3.75}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* Data points - hollow rings like mini sparkline */}
      {points.map((p, i) => {
        const isHovered = hoveredIndex === i;
        const isSelected = selectedIndex === i;
        const showAsSelected = !isHoveringChart && isSelected;
        const shouldHighlight = isHovered || showAsSelected;

        return (
          <g key={`point-${i}`}>
            {/* Visible dot - hollow ring */}
            <circle
              cx={p.x}
              cy={p.y}
              r={dotRadius}
              fill="none"
              stroke={shouldHighlight ? '#ef4444' : '#464548'}
              strokeWidth={dotStrokeWidth}
              vectorEffect="non-scaling-stroke"
              style={{
                cursor: 'pointer',
                transition: 'stroke 0.15s ease',
                pointerEvents: 'none',
              }}
            />
          </g>
        );
      })}

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
            onClick={() => onSelectIndex?.(i)}
          />
        );
      })}

      {/* Average line - dashed with pill-shaped dashes */}
      {(() => {
        const dashWidth = 16; // Doubled from 8
        const dashHeight = 3.75; // Match graph line thickness
        const numDashes = 25; // Adjusted for balanced spacing

        return Array.from({ length: numDashes }).map((_, i) => {
          const progressPercent = i / (numDashes - 1);
          const xPos = graphLeftEdge + progressPercent * (graphRightEdge - graphLeftEdge);

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
          fontSize: '18px',
          fontWeight: 350,
          fill: '#7C7F82',
        }}
      >
        avg
      </text>
    </svg>
  );
}

export function SatisfactionLineGraph({
  title,
  data,
  selectedIndex = data.length - 1,
  onSelectIndex,
  onActiveDataChange,
  onActiveLabelChange,
}: SatisfactionLineGraphProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  const [yAxisConfig, setYAxisConfig] = useState<YAxisConfig | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Get active data point (hovered or selected)
  const activeIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex;
  const activeData = activeIndex !== undefined && activeIndex !== null ? data[activeIndex] : null;

  // Notify parent of active data changes
  useEffect(() => {
    onActiveDataChange?.(activeData);
  }, [activeData, onActiveDataChange]);

  // Notify parent of active label changes (date string)
  useEffect(() => {
    if (activeData) {
      onActiveLabelChange?.(activeData.shiftDate || null);
    } else {
      onActiveLabelChange?.(null);
    }
  }, [activeData, onActiveLabelChange]);

  // Chart dimensions for percentage calculations
  const chartHeight = 220;
  const barScaleFactor = 0.95;

  const SCROLL_THRESHOLD = 20;
  const shouldScroll = data.length >= SCROLL_THRESHOLD;
  const chartViewBoxWidth = shouldScroll
    ? Math.round((data.length / SCROLL_THRESHOLD) * 1000)
    : 1000;

  // Calculate percentage position for bubble (matches SVG point calculation)
  const graphLeftPercent = (28 / chartViewBoxWidth) * 100;
  const graphRightPercent = ((chartViewBoxWidth - 1) / chartViewBoxWidth) * 100;
  const graphWidthPercent = graphRightPercent - graphLeftPercent;

  // Calculate X and Y percentages for bubble positioning
  const getBubblePosition = () => {
    if (activeIndex === null || activeIndex === undefined || !activeData || !yAxisConfig) {
      return null;
    }

    // X: distribute across graph width
    // Account for the sideGap and point spacing (same logic as SVG)
    const pointCount = data.length;
    const gapRatio = 0.3;
    const totalSlots = (pointCount + 2) + (pointCount - 1) * gapRatio;
    const slotWidth = graphWidthPercent / totalSlots;
    const sideGapPercent = slotWidth; // One slot width for side gap
    const pointSpacing = slotWidth * (1 + gapRatio);

    const xPercent = graphLeftPercent + sideGapPercent + activeIndex * pointSpacing + slotWidth / 2;

    // Y: same formula as SVG but inverted for CSS (top starts from top)
    const yFraction = (activeData.satisfaction - yAxisConfig.yMin) / yAxisConfig.yRange;
    const pointYPercent = (1 - yFraction * barScaleFactor) * 100;

    // Offset above point: dot outer radius (7.5) + gap (~20) = ~27.5 SVG units
    // Convert to percentage of chart height (220): 27.5 / 220 ≈ 12.5%
    const offsetPercent = 12.5;
    const yPercent = pointYPercent - offsetPercent;

    return { xPercent, yPercent };
  };

  const bubblePosition = getBubblePosition();

  // Adjust bubble x to be relative to the visible scroll container, not the inner wide div
  const scrollFactor = shouldScroll ? data.length / SCROLL_THRESHOLD : 1;
  const adjustedBubbleXPercent = bubblePosition
    ? bubblePosition.xPercent * scrollFactor - (scrollLeft / (scrollContainerRef.current?.clientWidth ?? 1)) * 100
    : null;
  const isBubbleVisible = adjustedBubbleXPercent !== null && adjustedBubbleXPercent >= 0 && adjustedBubbleXPercent <= 100;

  // Y-axis labels from dynamic ticks (only first and last get labels)
  const yLabels = yAxisConfig?.ticks.map((tickValue, index) => {
    const fraction = (tickValue - yAxisConfig.yMin) / yAxisConfig.yRange;
    const y = chartHeight * (1 - fraction * barScaleFactor);
    const isFirstOrLast = index === 0 || index === yAxisConfig.ticks.length - 1;
    return { y, value: tickValue, showLabel: isFirstOrLast };
  }) ?? [];

  return (
    <div
      className="flex flex-col relative"
      style={{
        backgroundColor: 'transparent',
        marginTop: -15,
        marginBottom: -15,
      }}
    >
      {/* Chart area - two column layout */}
      <div
        className="flex items-stretch"
        style={{ gap: '16px', position: 'relative' }}
        onMouseEnter={() => setIsHoveringChart(true)}
        onMouseLeave={() => {
          setIsHoveringChart(false);
          setHoveredIndex(null); // Clear hover when leaving chart area
        }}
      >
        {/* Chart and Y-axis wrapper - aspect ratio container for consistent positioning */}
        <div
          className="flex-1"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: '100%',
              aspectRatio: '1000 / 220',
              position: 'relative',
              display: 'flex',
            }}
          >
            {/* Chart area - scrollable when >= 20 points, flex row for sticky y-axis */}
            <div
              ref={scrollContainerRef}
              onScroll={() => setScrollLeft(scrollContainerRef.current?.scrollLeft ?? 0)}
              style={{
                flex: 1,
                overflowX: shouldScroll ? 'auto' : 'visible',
                position: 'relative',
                display: 'flex',
                alignItems: 'stretch',
              }}
            >
              {/* Wide inner chart div */}
              <div
                style={{
                  width: shouldScroll ? `${(data.length / SCROLL_THRESHOLD) * 100}%` : '100%',
                  minWidth: '100%',
                  flexShrink: 0,
                  height: '100%',
                  position: 'relative',
                }}
              >
                <SatisfactionLineChart
                  data={data}
                  hoveredIndex={hoveredIndex}
                  onHover={setHoveredIndex}
                  selectedIndex={selectedIndex}
                  onSelectIndex={onSelectIndex}
                  isHoveringChart={isHoveringChart}
                  onYAxisConfig={setYAxisConfig}
                  viewBoxWidth={chartViewBoxWidth}
                />
              </div>

              {/* Y-axis bar - sticky, uses standard ai-glass pattern so dev panel knobs apply */}
              <div
                style={{
                  position: 'sticky',
                  right: 0,
                  width: '56px',
                  flexShrink: 0,
                  marginLeft: '-56px',
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="ai-glass-border"
                  style={{
                    ...aiGlassLightBorderStyle('0.75rem', '0, 0, 0', 0.08),
                    position: 'absolute',
                    top: '15px',
                    bottom: '15px',
                    left: 0,
                    right: 0,
                  }}
                >
                  <div
                    className="ai-glass-content"
                    style={{
                      ...aiGlassLightContentStyle('0.75rem', 0.6),
                      position: 'relative',
                    }}
                  >
                    {yLabels.filter(label => label.showLabel).map((label) => (
                      <div
                        key={`y-label-${label.value}`}
                        style={{
                          position: 'absolute',
                          top: `${(label.y / chartHeight) * 100}%`,
                          transform: 'translateY(-50%)',
                          left: 0,
                          right: 0,
                          textAlign: 'center',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '16px',
                          fontWeight: 350,
                          color: '#7C7F82',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label.value}%
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bubble lives here — sibling of scroll container, same level as BoxPlotGraph.
                This escapes the overflowX:auto clipping that would trap it inside. */}
            {isBubbleVisible && bubblePosition && activeData && (
              <div
                style={{
                  position: 'absolute',
                  left: `${adjustedBubbleXPercent}%`,
                  top: `${bubblePosition.yPercent}%`,
                  transform: 'translate(-50%, -100%)',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('1.5rem', 0.5),
                      padding: '10px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '20px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {activeData.satisfaction.toFixed(2)}{' '}
                    <span style={{ fontSize: '14px', color: '#7C7F82' }}>%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
