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

const SCROLL_THRESHOLD = 13;

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

// 3-tick scale: 0, middle (nearest 10), top (nearest 10 above max)
function calculateSimpleTicks(maxValue: number): number[] {
  const top = Math.ceil(Math.max(maxValue, 1) / 10) * 10;
  const rawMid = top / 2;
  const mid = Math.min(Math.max(Math.round(rawMid / 10) * 10, 10), top - 10);
  return [0, mid, top];
}

function StackedPillBarChart({
  data,
  hoveredIndex,
  onHoverIndex,
  selectedIndex,
  onSelectIndex,
  isHoveringChart,
  onYAxisConfig,
  viewBoxWidth = 1000,
}: {
  data: StackedPillBarData[];
  hoveredIndex: number | null;
  onHoverIndex: (index: number | null) => void;
  selectedIndex: number | null;
  onSelectIndex?: (index: number) => void;
  isHoveringChart: boolean;
  onYAxisConfig?: (config: { yMax: number; ticks: number[] }) => void;
  viewBoxWidth?: number;
}) {
  const chartHeight = 180;

  // Margins — scale with viewBoxWidth so proportions stay consistent
  const graphLeftEdge = 15;
  const graphRightEdge = viewBoxWidth - 10;
  const chartWidth = graphRightEdge - graphLeftEdge;
  const topPadding = 20;
  const bottomPadding = 10;
  const graphHeight = chartHeight - topPadding - bottomPadding;

  const maxTotal = Math.max(...data.map(d => d.totalCount), 1);
  const ticks = calculateSimpleTicks(maxTotal);
  const yMax = ticks[ticks.length - 1] || maxTotal;

  useEffect(() => {
    onYAxisConfig?.({ yMax, ticks });
  }, [yMax, JSON.stringify(ticks), onYAxisConfig]);

  const barCount = data.length;
  const totalBarSpace = chartWidth * 0.85;
  const maxPillWidth = barCount <= 5 ? 80 : 42;
  const pillWidth = Math.min(maxPillWidth, totalBarSpace / barCount * 0.73);
  const barSpacing = (chartWidth - pillWidth * barCount) / (barCount + 1);

  const getY = (value: number) => topPadding + graphHeight - (value / yMax) * graphHeight;
  const getBarHeight = (value: number) => {
    const h = (value / yMax) * graphHeight;
    return h > 0 ? Math.max(3, h) : 0;
  };

  // Expand labeled ticks with 1 unlabeled line between each pair
  const allGridLines: number[] = [];
  for (let i = 0; i < ticks.length - 1; i++) {
    allGridLines.push(ticks[i]);
    allGridLines.push((ticks[i] + ticks[i + 1]) / 2);
  }
  allGridLines.push(ticks[ticks.length - 1]);

  const innerPadding = 8;
  const strokeWidth = 3;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxWidth} ${chartHeight}`} style={{ overflow: 'visible' }}>
      <defs>
        {allGridLines.map((_, i) => {
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

      <rect x={0} y={0} width={viewBoxWidth} height={chartHeight} fill="transparent" onMouseEnter={() => onHoverIndex(null)} />

      {allGridLines.map((tickValue, i) => {
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

      {data.map((item, i) => {
        const isHovered = hoveredIndex === i;
        const isSelected = selectedIndex === i;
        const showAsSelected = !isHoveringChart && isSelected;
        const shouldHighlight = isHovered || showAsSelected;
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

        const backFillColor = 'rgba(70, 69, 72, 0.25)';
        const backStrokeColor = '#464548';
        const frontFillColor = shouldHighlight ? 'rgba(239, 68, 68, 0.35)' : 'rgba(70, 69, 72, 0.5)';
        const frontStrokeColor = shouldHighlight ? '#ef4444' : '#464548';

        return (
          <g key={`bar-${i}`} style={{ opacity: shouldDim ? 0.4 : 1, transition: 'opacity 0.15s ease' }}>
            {totalHeight > 0 && (
              <rect
                x={barX} y={backPillY} width={pillWidth} height={totalHeight}
                rx={pillRadius} ry={pillRadius} fill={backFillColor}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {metHeight > 0 && (() => {
              const innerWidth = pillWidth - innerPadding * 2;
              const innerRadius = innerWidth / 2;
              const innerX = barX + innerPadding;
              const innerHeight = Math.max(0, metHeight - innerPadding * 2);
              const innerY = frontPillY + innerPadding;

              return (
                <rect
                  x={innerX} y={innerY} width={innerWidth} height={innerHeight}
                  rx={innerRadius} ry={innerRadius}
                  fill={frontFillColor} stroke={frontStrokeColor} strokeWidth={strokeWidth}
                  vectorEffect="non-scaling-stroke"
                  style={{ transition: 'stroke 0.15s ease, fill 0.15s ease', pointerEvents: 'none' }}
                />
              );
            })()}

            <rect
              x={barX - barSpacing / 2} y={0}
              width={pillWidth + barSpacing} height={chartHeight}
              fill="transparent" style={{ cursor: 'pointer' }}
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
  const data = preferenceData;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  const [yAxisConfig, setYAxisConfig] = useState<{ yMax: number; ticks: number[] } | null>(null);
  const [internalSelectedIndex, setInternalSelectedIndex] = useState<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const shouldScroll = data.length >= SCROLL_THRESHOLD;
  const chartViewBoxWidth = shouldScroll ? Math.round((data.length / SCROLL_THRESHOLD) * 1000) : 1000;

  const defaultSelectedIndex = data.length > 0
    ? data.reduce((maxIdx, item, idx, arr) =>
        item.satisfiedCount > arr[maxIdx].satisfiedCount ? idx : maxIdx, 0)
    : null;

  const effectiveSelectedIndex = selectedIndex ?? internalSelectedIndex ?? defaultSelectedIndex;
  const handleSelectIndex = (index: number) => {
    setInternalSelectedIndex(index);
    onSelectIndex?.(index);
  };

  const activeIndex = hoveredIndex ?? effectiveSelectedIndex;
  const activeData = activeIndex !== null ? data[activeIndex] : null;

  useEffect(() => {
    onActiveDataChange?.(activeData);
  }, [activeData, onActiveDataChange]);

  useEffect(() => {
    if (activeData) {
      onActiveLabelChange?.(activeData.description || activeData.label);
    } else {
      onActiveLabelChange?.(null);
    }
  }, [activeData, onActiveLabelChange]);

  const chartHeight = 180;
  const topPadding = 20;
  const bottomPadding = 10;
  const graphHeight = chartHeight - topPadding - bottomPadding;
  const scaleFactor = graphHeight / chartHeight;

  const getDisplayValue = (): string | null => {
    if (!activeData) return null;
    if (showPercentage) {
      const pct = activeData.totalCount > 0 ? Math.round((activeData.satisfiedCount / activeData.totalCount) * 100) : 0;
      return `${pct}%`;
    }
    return `${activeData.satisfiedCount} / ${activeData.totalCount}`;
  };

  const displayValue = getDisplayValue();

  // Compute bubble x using SVG coordinate units (matches inner SVG exactly)
  const getBubblePosition = () => {
    if (activeIndex === null || !data.length || !yAxisConfig) return null;

    const graphLeftEdge = 15;
    const graphRightEdge = chartViewBoxWidth - 10;
    const svgChartWidth = graphRightEdge - graphLeftEdge;

    const barCount = data.length;
    const totalBarSpace = svgChartWidth * 0.85;
    const maxPillWidth = barCount <= 5 ? 80 : 42;
    const pillWidth = Math.min(maxPillWidth, totalBarSpace / barCount * 0.73);
    const barSpacing = (svgChartWidth - pillWidth * barCount) / (barCount + 1);

    const barX = graphLeftEdge + barSpacing + activeIndex * (pillWidth + barSpacing);
    const centerX = barX + pillWidth / 2;
    const xPercent = (centerX / chartViewBoxWidth) * 100;

    const item = data[activeIndex];
    const yFraction = item.totalCount / yAxisConfig.yMax;
    const topOffsetPercent = (topPadding / chartHeight) * 100;
    const barTopYPercent = topOffsetPercent + (1 - yFraction) * scaleFactor * 100;
    const yPercent = barTopYPercent - 7.5;

    return { xPercent, yPercent };
  };

  const bubblePosition = getBubblePosition();

  const scrollFactor = shouldScroll ? data.length / SCROLL_THRESHOLD : 1;
  const adjustedBubbleXPercent = bubblePosition
    ? bubblePosition.xPercent * scrollFactor - (scrollLeft / (scrollContainerRef.current?.clientWidth ?? 1)) * 100
    : null;

  // Y-axis labels for the sticky bar
  const yLabels = yAxisConfig?.ticks.map(tickValue => {
    const yFraction = tickValue / yAxisConfig.yMax;
    const topOffsetPercent = (topPadding / chartHeight) * 100;
    const yPercent = topOffsetPercent + (1 - yFraction) * scaleFactor * 100;
    return { y: yPercent, value: tickValue };
  }) ?? [];

  // Equal insets on both sides — use the smaller (bottom) padding value for symmetry
  const bottomInsetPercent = (bottomPadding / chartHeight) * 100;
  const topInsetPercent = bottomInsetPercent;

  if (!data.length) return null;

  return (
    <div className="flex flex-col relative" style={{ backgroundColor: 'transparent' }}>
      <div
        className="flex flex-col"
        style={{ gap: '8px', position: 'relative' }}
        onMouseEnter={() => setIsHoveringChart(true)}
        onMouseLeave={() => {
          setIsHoveringChart(false);
          setHoveredIndex(null);
        }}
      >
        <div className="flex-1" style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '100%',
              aspectRatio: '1000 / 180',
              position: 'relative',
              display: 'flex',
            }}
          >
            {/* Scroll container */}
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
              {/* Wide inner chart div — grows proportionally when scrolling */}
              <div
                style={{
                  width: shouldScroll ? `${(data.length / SCROLL_THRESHOLD) * 100}%` : '100%',
                  minWidth: '100%',
                  flexShrink: 0,
                  height: '100%',
                  position: 'relative',
                }}
              >
                <StackedPillBarChart
                  data={data}
                  hoveredIndex={hoveredIndex}
                  onHoverIndex={setHoveredIndex}
                  selectedIndex={effectiveSelectedIndex}
                  onSelectIndex={handleSelectIndex}
                  isHoveringChart={isHoveringChart}
                  onYAxisConfig={setYAxisConfig}
                  viewBoxWidth={chartViewBoxWidth}
                />
              </div>

              {/* Y-axis sticky bar — same ai-glass pattern as other cards */}
              <div
                style={{
                  position: 'sticky',
                  right: 0,
                  width: '48px',
                  flexShrink: 0,
                  marginLeft: '-48px',
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="ai-glass-border"
                  style={{
                    ...aiGlassLightBorderStyle('0.75rem', '0, 0, 0', 0.08),
                    position: 'absolute',
                    top: `${topInsetPercent}%`,
                    bottom: `${bottomInsetPercent}%`,
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
                    {yLabels.map((label, i) => (
                      <div
                        key={`y-label-${i}`}
                        style={{
                          position: 'absolute',
                          top: `${label.y}%`,
                          transform: 'translateY(-50%)',
                          left: 0,
                          right: 0,
                          textAlign: 'center',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: 350,
                          color: '#7C7F82',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label.value}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bubble lives here — sibling of scroll container, same level as BoxPlotGraph.
                This escapes the overflowX:auto clipping that would trap it inside. */}
            {bubblePosition && activeIndex !== null && displayValue && adjustedBubbleXPercent !== null && (
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
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('1.5rem')}>
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
        </div>
      </div>
    </div>
  );
}

export default StackedPillBarGraph;
