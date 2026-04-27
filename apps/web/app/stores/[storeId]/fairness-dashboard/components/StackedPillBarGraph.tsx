'use client';

import React, { useState, useEffect } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

export interface StackedPillBarData {
  label: string;
  totalCount: number;
  satisfiedCount: number;
  description?: string;
}

interface StackedPillBarGraphProps {
  preferenceData: StackedPillBarData[];
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  onActiveDataChange?: (data: StackedPillBarData | null) => void;
  onActiveLabelChange?: (label: string | null) => void;
  showPercentage?: boolean;
}

// Simple seeded random number generator for consistent gradients
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate random gradient stops for grid lines
function generateRandomGradient(seed: number): Array<{ offset: number; opacity: number }> {
  const stops: Array<{ offset: number; opacity: number }> = [];
  stops.push({ offset: 0, opacity: 0 });
  const numStops = Math.floor(seededRandom(seed) * 3) + 5;
  for (let i = 1; i < numStops - 1; i++) {
    const position = seededRandom(seed + i * 100) * 80 + 10;
    const opacity = seededRandom(seed + i * 200) * 0.14 + 0.04;
    stops.push({ offset: position, opacity });
  }
  stops.push({ offset: 100, opacity: 0 });
  stops.sort((a, b) => a.offset - b.offset);
  return stops;
}

// Calculate evenly spaced tick values for Y-axis using nice round numbers
function calculateNiceTicks(min: number, max: number, targetTickCount: number = 5): number[] {
  if (max === min) return [min];

  // Calculate rough step size
  const roughStep = (max - min) / (targetTickCount - 1);

  // Find a "nice" step size (1, 2, 5, 10, 20, 50, etc.)
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;

  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3) niceStep = 2 * magnitude;
  else if (residual <= 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  // Generate ticks at multiples of niceStep
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let tick = niceMin; tick <= niceMax; tick += niceStep) {
    ticks.push(tick);
  }

  return ticks;
}

function StackedPillBarChart({
  data,
  hoveredIndex,
  onHoverIndex,
  selectedIndex,
  onSelectIndex,
  isHoveringChart,
  onYAxisConfig,
}: {
  data: StackedPillBarData[];
  hoveredIndex: number | null;
  onHoverIndex: (index: number | null) => void;
  selectedIndex: number | null;
  onSelectIndex?: (index: number) => void;
  isHoveringChart: boolean;
  onYAxisConfig?: (config: { yMax: number; ticks: number[] }) => void;
}) {
  const chartHeight = 180;
  const viewBoxWidth = 1000;

  // Margins
  const graphLeftEdge = 15;
  const graphRightEdge = viewBoxWidth - 10;
  const chartWidth = graphRightEdge - graphLeftEdge;
  const topPadding = 20;
  const bottomPadding = 10;
  const graphHeight = chartHeight - topPadding - bottomPadding;

  // Calculate max value for scaling
  const maxTotal = Math.max(...data.map(d => d.totalCount), 1);
  const ticks = calculateNiceTicks(0, maxTotal * 1.1, 5);
  // Use the max tick value as yMax so bars align with labels
  const yMax = ticks[ticks.length - 1] || maxTotal;

  useEffect(() => {
    onYAxisConfig?.({ yMax, ticks });
  }, [yMax, JSON.stringify(ticks), onYAxisConfig]);

  // Bar dimensions - dynamic max width based on bar count
  const barCount = data.length;
  const totalBarSpace = chartWidth * 0.85;
  const maxPillWidth = barCount <= 5 ? 80 : 42;
  const pillWidth = Math.min(maxPillWidth, totalBarSpace / barCount * 0.73);
  const barSpacing = (chartWidth - pillWidth * barCount) / (barCount + 1);

  // Get Y position from value (inverted - higher values = lower y)
  const getY = (value: number) => {
    return topPadding + graphHeight - (value / yMax) * graphHeight;
  };

  // Get bar height from value
  const getBarHeight = (value: number) => {
    const h = (value / yMax) * graphHeight;
    return h > 0 ? Math.max(3, h) : 0;
  };

  // Padding for inner (met) bar
  const innerPadding = 8;
  const strokeWidth = 3;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxWidth} ${chartHeight}`} style={{ overflow: 'visible' }}>
      <defs>
        {/* Horizontal grid gradients */}
        {ticks.map((_, i) => {
          const stops = generateRandomGradient(2000 + i);
          return (
            <linearGradient key={`hgrad-${i}`} id={`stackedbar-horizontalGridGradient-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              {stops.map((stop, j) => (
                <stop key={j} offset={`${stop.offset}%`} stopColor="#7C7F82" stopOpacity={stop.opacity} />
              ))}
            </linearGradient>
          );
        })}
      </defs>

      {/* Background rect to clear hover when in empty space */}
      <rect
        x={0}
        y={0}
        width={viewBoxWidth}
        height={chartHeight}
        fill="transparent"
        onMouseEnter={() => onHoverIndex(null)}
      />

      {/* Horizontal grid lines */}
      {ticks.map((tickValue, i) => {
        const y = getY(tickValue);
        return (
          <rect
            key={`hline-${i}`}
            x={graphLeftEdge}
            y={y - 0.75}
            width={chartWidth}
            height={1.5}
            fill={`url(#stackedbar-horizontalGridGradient-${i})`}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* Bar groups */}
      {data.map((item, i) => {
        const isHovered = hoveredIndex === i;
        const isSelected = selectedIndex === i;
        const showAsSelected = !isHoveringChart && isSelected;
        const shouldHighlight = isHovered || showAsSelected;

        // Dim other bars when one is hovered
        const shouldDim = isHoveringChart && hoveredIndex !== null && !isHovered;

        const barX = graphLeftEdge + barSpacing + i * (pillWidth + barSpacing);
        const totalHeight = getBarHeight(item.totalCount);
        const rawMetHeight = item.satisfiedCount > 0 ? (item.satisfiedCount / yMax) * graphHeight : 0;
        const metHeight = item.satisfiedCount > 0
          ? Math.min(totalHeight, Math.max(innerPadding * 2 + 6, rawMetHeight))
          : 0;

        const backPillY = getY(item.totalCount);
        const frontPillY = getY(item.satisfiedCount);
        const pillRadius = pillWidth / 2;

        // Colors
        const backFillColor = 'rgba(70, 69, 72, 0.25)';
        const backStrokeColor = '#464548';
        const frontFillColor = shouldHighlight ? 'rgba(239, 68, 68, 0.35)' : 'rgba(70, 69, 72, 0.5)';
        const frontStrokeColor = shouldHighlight ? '#ef4444' : '#464548';

        return (
          <g
            key={`bar-${i}`}
            style={{
              opacity: shouldDim ? 0.4 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {/* Back pill (total) - no border */}
            {totalHeight > 0 && (
              <rect
                x={barX}
                y={backPillY}
                width={pillWidth}
                height={totalHeight}
                rx={pillRadius}
                ry={pillRadius}
                fill={backFillColor}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Front pill (met) - smaller with padding, has border */}
            {metHeight > 0 && (() => {
              const innerWidth = pillWidth - innerPadding * 2;
              const innerRadius = innerWidth / 2;
              const innerX = barX + innerPadding;
              // Adjust height to account for padding at top and bottom
              const innerHeight = Math.max(0, metHeight - innerPadding * 2);
              const innerY = frontPillY + innerPadding;

              return (
                <rect
                  x={innerX}
                  y={innerY}
                  width={innerWidth}
                  height={innerHeight}
                  rx={innerRadius}
                  ry={innerRadius}
                  fill={frontFillColor}
                  stroke={frontStrokeColor}
                  strokeWidth={strokeWidth}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    transition: 'stroke 0.15s ease, fill 0.15s ease',
                    pointerEvents: 'none',
                  }}
                />
              );
            })()}

            {/* Invisible hover zone */}
            <rect
              x={barX - barSpacing / 2}
              y={0}
              width={pillWidth + barSpacing}
              height={chartHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverIndex(i)}
              onClick={() => onSelectIndex?.(i)}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function StackedPillBarGraph({
  preferenceData,
  selectedIndex,
  onSelectIndex,
  onActiveDataChange,
  onActiveLabelChange,
  showPercentage = false,
}: StackedPillBarGraphProps) {
  // Alias for internal use
  const data = preferenceData;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  const [yAxisConfig, setYAxisConfig] = useState<{ yMax: number; ticks: number[] } | null>(null);
  const [internalSelectedIndex, setInternalSelectedIndex] = useState<number | null>(null);

  // Find index of bar with highest satisfiedCount for default selection
  const defaultSelectedIndex = data.length > 0
    ? data.reduce((maxIdx, item, idx, arr) =>
        item.satisfiedCount > arr[maxIdx].satisfiedCount ? idx : maxIdx, 0)
    : null;

  // Use controlled or internal selection (default to highest satisfied)
  const effectiveSelectedIndex = selectedIndex ?? internalSelectedIndex ?? defaultSelectedIndex;
  const handleSelectIndex = (index: number) => {
    setInternalSelectedIndex(index);
    onSelectIndex?.(index);
  };

  // Active index (hovered takes precedence)
  const activeIndex = hoveredIndex ?? effectiveSelectedIndex;
  const activeData = activeIndex !== null ? data[activeIndex] : null;

  useEffect(() => {
    onActiveDataChange?.(activeData);
  }, [activeData, onActiveDataChange]);

  useEffect(() => {
    if (activeData) {
      // Pass description (or label as fallback) for header display
      onActiveLabelChange?.(activeData.description || activeData.label);
    } else {
      onActiveLabelChange?.(null);
    }
  }, [activeData, onActiveLabelChange]);

  const chartHeight = 180;

  // Match SVG margins (15/1000 = 1.5%, 990/1000 = 99%)
  const graphLeftPercent = 1.5;
  const graphRightPercent = 99;

  // Format display value
  const getDisplayValue = (): string | null => {
    if (!activeData) return null;
    if (showPercentage) {
      const pct = activeData.totalCount > 0 ? Math.round((activeData.satisfiedCount / activeData.totalCount) * 100) : 0;
      return `${pct}%`;
    }
    return `${activeData.satisfiedCount} / ${activeData.totalCount}`;
  };

  const displayValue = getDisplayValue();

  // Graph area constants (must match SVG inner component)
  const topPadding = 20;
  const bottomPadding = 10;
  const graphHeight = chartHeight - topPadding - bottomPadding;
  const scaleFactor = graphHeight / chartHeight; // 150/180 = 0.833

  // Calculate bubble position (matching SatisfactionLineGraph approach)
  const getBubblePosition = () => {
    // Wait for yAxisConfig to ensure consistent positioning with SVG
    if (activeIndex === null || !data.length || !yAxisConfig) return null;

    const barCount = data.length;
    const chartWidthPercent = graphRightPercent - graphLeftPercent;
    const maxPillWidthPercent = barCount <= 5 ? 8.0 : 4.2;
    const pillWidthPercent = Math.min(maxPillWidthPercent, chartWidthPercent * 0.85 / barCount * 0.73);
    const barSpacingPercent = (chartWidthPercent - pillWidthPercent * barCount) / (barCount + 1);

    const xPercent = graphLeftPercent + barSpacingPercent + activeIndex * (pillWidthPercent + barSpacingPercent) + pillWidthPercent / 2;

    // Y position - use same formula pattern as SatisfactionLineGraph
    const item = data[activeIndex];
    const yFraction = item.totalCount / yAxisConfig.yMax;

    // Calculate bar top Y as percentage of chart height
    // Bar top in SVG: topPadding + graphHeight * (1 - yFraction)
    // As percentage: (topPadding/chartHeight)*100 + (1 - yFraction) * scaleFactor * 100
    const topOffsetPercent = (topPadding / chartHeight) * 100;
    const barTopYPercent = topOffsetPercent + (1 - yFraction) * scaleFactor * 100;

    // Fixed offset for bubble gap (percentage of chart height)
    // ~13.5 SVG units gap / 180 chart height ≈ 7.5%
    const offsetPercent = 7.5;
    const yPercent = barTopYPercent - offsetPercent;

    return { xPercent, yPercent };
  };

  const bubblePosition = getBubblePosition();

  // Y-axis labels (using same constants as bubble positioning)
  const yLabels = yAxisConfig?.ticks.map(tickValue => {
    const yFraction = tickValue / yAxisConfig.yMax;
    const topOffsetPercent = (topPadding / chartHeight) * 100;
    const yPercent = topOffsetPercent + (1 - yFraction) * scaleFactor * 100;
    return { y: yPercent, value: tickValue };
  }) ?? [];

  // X-axis labels
  const xLabels = data.map((item, i) => {
    const barCount = data.length;
    const chartWidthPercent = graphRightPercent - graphLeftPercent;
    const maxPillWidthPercent = barCount <= 5 ? 8.0 : 4.2;
    const pillWidthPercent = Math.min(maxPillWidthPercent, chartWidthPercent * 0.85 / barCount * 0.73);
    const barSpacingPercent = (chartWidthPercent - pillWidthPercent * barCount) / (barCount + 1);
    const xPercent = graphLeftPercent + barSpacingPercent + i * (pillWidthPercent + barSpacingPercent) + pillWidthPercent / 2;
    return { x: xPercent, label: item.label };
  });

  if (!data.length) return null;

  return (
    <div
      className="flex flex-col relative"
      style={{ backgroundColor: 'transparent' }}
    >
      <div
        className="flex flex-col"
        style={{ gap: '8px', position: 'relative' }}
        onMouseEnter={() => setIsHoveringChart(true)}
        onMouseLeave={() => {
          setIsHoveringChart(false);
          setHoveredIndex(null);
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
              aspectRatio: '1000 / 180',
              position: 'relative',
              display: 'flex',
            }}
          >
            {/* Chart area */}
            <div style={{ flex: 1, position: 'relative' }}>
              <StackedPillBarChart
                data={data}
                hoveredIndex={hoveredIndex}
                onHoverIndex={setHoveredIndex}
                selectedIndex={effectiveSelectedIndex}
                onSelectIndex={handleSelectIndex}
                isHoveringChart={isHoveringChart}
                onYAxisConfig={setYAxisConfig}
              />

              {/* Value bubble - positioned relative to chart */}
              {bubblePosition && activeIndex !== null && displayValue && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${bubblePosition.xPercent}%`,
                    top: `${bubblePosition.yPercent}%`,
                    transform: 'translate(-50%, -100%)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  <div
                    className="ai-glass-border"
                    style={aiGlassLightBorderStyle('1.5rem')}
                  >
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
                        textAlign: 'center',
                      }}
                    >
                      {displayValue}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Y-axis labels - inside aspect-ratio wrapper for alignment */}
            <div
              style={{
                position: 'relative',
                width: '15px',
                flexShrink: 0,
              }}
            >
              {yLabels.map((label, i) => (
                <div
                  key={`y-label-${i}`}
                  style={{
                    position: 'absolute',
                    top: `${label.y}%`,
                    right: 0,
                    transform: 'translateY(-50%)',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 350,
                    color: '#7C7F82',
                    textAlign: 'right',
                  }}
                >
                  {label.value}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default StackedPillBarGraph;
