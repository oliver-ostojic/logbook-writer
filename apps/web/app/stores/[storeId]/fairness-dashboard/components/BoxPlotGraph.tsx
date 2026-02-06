'use client';

import React, { useState, useEffect } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface BoxPlotDataPoint {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

type StatType = 'min' | 'q1' | 'median' | 'q3' | 'max' | 'box';

interface BoxPlotGraphProps {
  data: BoxPlotDataPoint[];
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  onActiveDataChange?: (data: BoxPlotDataPoint | null) => void;
  onActiveLabelChange?: (label: string | null) => void; // Callback for active stat label (e.g., "Median", "Min & Max")
  unit?: string;
  valueFormatter?: (value: number) => string;
  xAxisFormatter?: (value: number) => string; // Formatter for X-axis labels
  insetXAxisLabels?: boolean; // Inset first/last X-axis labels from edges (useful for long time format labels)
}

interface XAxisConfig {
  xMin: number;
  xMax: number;
  xRange: number;
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

// Calculate evenly spaced tick values for axis (6 ticks for consistent spacing)
function calculateNiceTicks(min: number, max: number, tickCount: number = 6): number[] {
  const range = max - min;
  if (range === 0) {
    return [min];
  }

  // Generate exactly tickCount evenly spaced values
  const ticks: number[] = [];
  for (let i = 0; i < tickCount; i++) {
    const value = min + (range * i) / (tickCount - 1);
    // Round to reasonable precision
    ticks.push(Math.round(value * 10) / 10);
  }

  return ticks;
}

const STAT_LABELS: Record<StatType, string> = {
  min: 'Min',
  q1: 'Q1',
  median: 'Median',
  q3: 'Q3',
  max: 'Max',
  box: 'Q1 - Q3',
};

// Get combined label for overlapping stats (e.g., "Min & Median" when min === median)
function getOverlappingStatsLabel(
  activeStat: StatType,
  data: BoxPlotDataPoint
): string {
  // Special case for box (IQR range)
  if (activeStat === 'box') {
    return 'Q1 - Q3';
  }

  const overlapping: StatType[] = [];

  // Check which stats share the same value as the active stat
  const activeValue = data[activeStat as keyof BoxPlotDataPoint] as number;

  // Only check min, median, max (the visible markers)
  if (data.min === activeValue) overlapping.push('min');
  if (data.median === activeValue) overlapping.push('median');
  if (data.max === activeValue) overlapping.push('max');

  // Sort in logical order: min, median, max
  const order: StatType[] = ['min', 'median', 'max'];
  overlapping.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  // Join with " & "
  return overlapping.map(stat => STAT_LABELS[stat]).join(' & ');
}

function BoxPlotChart({
  data,
  hoveredStat,
  onHoverStat,
  selectedStat,
  onSelectStat,
  isHoveringChart,
  onXAxisConfig,
}: {
  data: BoxPlotDataPoint;
  hoveredStat: StatType | null;
  onHoverStat: (stat: StatType | null) => void;
  selectedStat: StatType | null;
  onSelectStat?: (stat: StatType) => void;
  isHoveringChart: boolean;
  onXAxisConfig?: (config: XAxisConfig) => void;
}) {
  const chartHeight = 160;
  const viewBoxWidth = 1000;

  // Margins for the graph area
  const graphLeftEdge = 40;  // ~4% padding
  const graphRightEdge = viewBoxWidth - 40;  // ~4% padding
  const chartWidth = graphRightEdge - graphLeftEdge;

  // Dynamic X-axis range based on box plot values
  const allValues = [data.min, data.q1, data.median, data.q3, data.max].filter(v => !isNaN(v) && isFinite(v));

  if (allValues.length === 0) {
    return null;
  }

  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const dataRange = dataMax - dataMin;

  const paddingAmount = dataRange > 0 ? dataRange * 0.15 : 3;
  const xMin = Math.max(0, Math.floor(dataMin - paddingAmount));
  const xMax = Math.ceil(dataMax + paddingAmount);
  const xRange = xMax - xMin || 1;

  const ticks = calculateNiceTicks(xMin, xMax, 6);

  // Ensure display range contains all data points (ticks might round inward)
  const displayXMin = Math.min(ticks[0], dataMin);
  const displayXMax = Math.max(ticks[ticks.length - 1], dataMax);
  const displayXRange = displayXMax - displayXMin || 1;

  // No scale factor - use full width
  const barScaleFactor = 1.0;

  const ticksKey = JSON.stringify(ticks);
  useEffect(() => {
    onXAxisConfig?.({ xMin: displayXMin, xMax: displayXMax, xRange: displayXRange, ticks });
  }, [displayXMin, displayXMax, displayXRange, ticksKey, onXAxisConfig]);

  // Box plot styling constants
  const strokeWidth = 3.75;
  const pillWidth = 20;        // Full width for outer capsule, Q1, Q3
  const narrowPillWidth = 10;  // Half width for min, max, median

  // Heights for box plot elements (reduced by 25%)
  const outerCapsuleHeight = 90;
  const medianHeight = 108;
  const minMaxHeight = 60;

  // Calculate X position for a value (horizontal layout)
  const getX = (value: number) => {
    return graphLeftEdge + ((value - displayXMin) / displayXRange) * chartWidth * barScaleFactor;
  };

  // Center Y position for the horizontal box plot
  const centerY = chartHeight / 2;

  // Calculate positions for each stat
  const positions = {
    min: getX(data.min),
    q1: getX(data.q1),
    median: getX(data.median),
    q3: getX(data.q3),
    max: getX(data.max),
  };

  const stats: StatType[] = ['min', 'q1', 'median', 'q3', 'max'];

  // Number of vertical grid lines (for the ticks)
  const numVerticalLines = ticks.length;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxWidth} ${chartHeight}`} style={{ overflow: 'visible' }}>
      <defs>
        {/* Unique gradient for each vertical grid line */}
        {ticks.map((_, i) => {
          const stops = generateRandomGradient(1000 + i);
          return (
            <linearGradient key={`vgrad-${i}`} id={`boxplot-verticalGridGradient-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              {stops.map((stop, j) => (
                <stop key={j} offset={`${stop.offset}%`} stopColor="#7C7F82" stopOpacity={stop.opacity} />
              ))}
            </linearGradient>
          );
        })}

        {/* Horizontal gradient for the whisker line */}
        {(() => {
          const stops = generateRandomGradient(3000);
          return (
            <linearGradient id="boxplot-horizontalWhiskerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              {stops.map((stop, j) => (
                <stop key={j} offset={`${stop.offset}%`} stopColor="#7C7F82" stopOpacity={stop.opacity * 0.5} />
              ))}
            </linearGradient>
          );
        })()}
      </defs>

      {/* Background rect to clear hover when in empty space */}
      <rect
        x={0}
        y={0}
        width={viewBoxWidth}
        height={chartHeight}
        fill="transparent"
        onMouseEnter={() => onHoverStat(null)}
      />

      {/* Vertical grid lines at tick positions */}
      {ticks.map((tickValue, i) => {
        const fraction = (tickValue - displayXMin) / displayXRange;
        const x = graphLeftEdge + fraction * chartWidth * barScaleFactor;
        return (
          <rect
            key={`vline-${i}`}
            x={x - 0.9375}
            y={0}
            width={1.875}
            height={chartHeight}
            fill={`url(#boxplot-verticalGridGradient-${i})`}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* Whisker line from min marker to Q1 box edge (only if there's space) */}
      {positions.q1 - pillWidth / 2 > positions.min + narrowPillWidth / 2 && (
        <line
          x1={positions.min + narrowPillWidth / 2}
          y1={centerY}
          x2={positions.q1 - pillWidth / 2}
          y2={centerY}
          stroke="#464548"
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
          style={{ transition: 'stroke 0.15s ease' }}
        />
      )}

      {/* Whisker line from Q3 box edge to max marker (only if there's space) */}
      {positions.max - narrowPillWidth / 2 > positions.q3 + pillWidth / 2 && (
        <line
          x1={positions.q3 + pillWidth / 2}
          y1={centerY}
          x2={positions.max - narrowPillWidth / 2}
          y2={centerY}
          stroke="#464548"
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
          style={{ transition: 'stroke 0.15s ease' }}
        />
      )}

      {/* Box from Q1 to Q3 (interquartile range) - visual only */}
      {(() => {
        const isBoxHovered = hoveredStat === 'box';
        const isBoxSelected = selectedStat === 'box';
        const showBoxAsSelected = !isHoveringChart && isBoxSelected;
        const shouldHighlightBox = isBoxHovered || showBoxAsSelected;
        const boxStrokeColor = shouldHighlightBox ? '#ef4444' : '#464548';
        const boxFillColor = shouldHighlightBox ? 'rgba(239, 68, 68, 0.35)' : 'rgba(70, 69, 72, 0.35)';

        // Calculate the median marker exclusion zone (with 5px padding)
        const hoverPadding = 5;
        const medianHoverHalfWidth = narrowPillWidth / 2 + hoverPadding;
        const medianLeft = positions.median - medianHoverHalfWidth;
        const medianRight = positions.median + medianHoverHalfWidth;
        const boxLeft = positions.q1 - pillWidth / 2;
        const boxRight = positions.q3 + pillWidth / 2;

        // Expanded hover zone height (5px padding on each side)
        const boxHoverHeight = outerCapsuleHeight + hoverPadding * 2;

        return (
          <>
            {/* Visual box (no pointer events) */}
            <rect
              x={boxLeft}
              y={centerY - outerCapsuleHeight / 2}
              width={boxRight - boxLeft}
              height={outerCapsuleHeight}
              rx={pillWidth / 2}
              ry={pillWidth / 2}
              fill={boxFillColor}
              stroke={boxStrokeColor}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
              style={{
                transition: 'stroke 0.15s ease, fill 0.15s ease',
                pointerEvents: 'none',
              }}
            />
            {/* Left hover zone (Q1 to median) - expanded with padding */}
            <rect
              x={boxLeft - hoverPadding}
              y={centerY - boxHoverHeight / 2}
              width={Math.max(0, medianLeft - boxLeft + hoverPadding)}
              height={boxHoverHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => {
                if (selectedStat !== 'box') {
                  onHoverStat('box');
                }
              }}
              onClick={() => onSelectStat?.('box')}
            />
            {/* Right hover zone (median to Q3) - expanded with padding */}
            <rect
              x={medianRight}
              y={centerY - boxHoverHeight / 2}
              width={Math.max(0, boxRight - medianRight + hoverPadding)}
              height={boxHoverHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => {
                if (selectedStat !== 'box') {
                  onHoverStat('box');
                }
              }}
              onClick={() => onSelectStat?.('box')}
            />
          </>
        );
      })()}

      {/* Min, Median, Max markers - tall narrow pills */}
      {/* Render order: min, max, median (median last so it's always on top) */}
      {/* Skip min/max if they overlap with median (median is taller and would cover them) */}
      {(['min', 'max', 'median'] as const).map((stat) => {
        // Skip min if it's at the same position as median (median is taller)
        if (stat === 'min' && data.min === data.median) return null;
        // Skip max if it's at the same position as median (median is taller)
        if (stat === 'max' && data.max === data.median) return null;
        // Skip min if it's at the same position as max (max renders after min, same height)
        if (stat === 'min' && data.min === data.max) return null;

        const isHovered = hoveredStat === stat;
        const isSelected = selectedStat === stat;
        const showAsSelected = !isHoveringChart && isSelected;
        const shouldHighlight = isHovered || showAsSelected;
        const strokeColor = shouldHighlight ? '#ef4444' : '#464548';
        const fillColor = shouldHighlight ? 'rgba(239, 68, 68, 0.35)' : 'rgba(70, 69, 72, 0.35)';

        // Median is taller
        const height = stat === 'median' ? medianHeight : minMaxHeight;

        // 5px padding for expanded hover zone
        const hoverPadding = 5;
        const hoverWidth = narrowPillWidth + hoverPadding * 2;
        const hoverHeight = height + hoverPadding * 2;

        return (
          <g key={`marker-${stat}`}>
            {/* Visual marker (no pointer events) */}
            <rect
              x={positions[stat] - narrowPillWidth / 2}
              y={centerY - height / 2}
              width={narrowPillWidth}
              height={height}
              rx={narrowPillWidth / 2}
              ry={narrowPillWidth / 2}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
              style={{
                transition: 'stroke 0.15s ease, fill 0.15s ease',
                pointerEvents: 'none',
              }}
            />
            {/* Invisible hover zone (expanded with padding) */}
            <rect
              x={positions[stat] - hoverWidth / 2}
              y={centerY - hoverHeight / 2}
              width={hoverWidth}
              height={hoverHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => {
                // Skip hover if this stat is already selected (avoid re-highlight flash)
                if (selectedStat !== stat) {
                  onHoverStat(stat);
                }
              }}
              onClick={() => onSelectStat?.(stat)}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function BoxPlotGraph({
  data,
  selectedIndex = 0,
  onSelectIndex,
  onActiveDataChange,
  onActiveLabelChange,
  unit = '%',
  valueFormatter,
  xAxisFormatter,
  insetXAxisLabels = false,
}: BoxPlotGraphProps) {
  const [hoveredStat, setHoveredStat] = useState<StatType | null>(null);
  const [selectedStat, setSelectedStat] = useState<StatType | null>('median');
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  const [xAxisConfig, setXAxisConfig] = useState<XAxisConfig | null>(null);

  // Use first data point for single box plot (can extend for multiple later)
  const activeData = data[0] || null;

  useEffect(() => {
    onActiveDataChange?.(activeData);
  }, [activeData, onActiveDataChange]);

  // Get the currently active stat (hovered takes precedence over selected)
  const activeStat = hoveredStat ?? selectedStat;

  // Notify parent of active label changes
  useEffect(() => {
    if (activeStat && activeData) {
      onActiveLabelChange?.(getOverlappingStatsLabel(activeStat, activeData));
    } else {
      onActiveLabelChange?.(null);
    }
  }, [activeStat, activeData, onActiveLabelChange]);

  const chartHeight = 160;
  // No scale factor - use full width
  const barScaleFactor = 1.0;

  // Match SVG margins (40/1000 = 4%)
  const graphLeftPercent = 4;
  const graphRightPercent = 96;

  // Format value without unnecessary decimals
  const formatValue = valueFormatter ?? ((v: number) => {
    const formatted = Number.isInteger(v) ? v.toString() : v.toFixed(1).replace(/\.0$/, '');
    return `${formatted}${unit}`;
  });

  // Format X-axis labels
  const formatXAxis = xAxisFormatter ?? ((v: number) => {
    return Number.isInteger(v) ? v.toString() : v.toFixed(1).replace(/\.0$/, '');
  });

  // Format the display value (range for box, single value for others)
  const getDisplayValue = (): string | null => {
    if (!activeStat || !activeData) return null;
    if (activeStat === 'box') {
      return `${formatValue(activeData.q1)} - ${formatValue(activeData.q3)}`;
    }
    const value = activeData[activeStat as keyof BoxPlotDataPoint] as number;
    return formatValue(value);
  };

  const displayValue = getDisplayValue();

  const getBubblePosition = () => {
    if (!activeStat || !activeData || !xAxisConfig) {
      return null;
    }

    let value: number;
    if (activeStat === 'box') {
      // Center the bubble on the box (midpoint of Q1 and Q3)
      value = (activeData.q1 + activeData.q3) / 2;
    } else {
      value = activeData[activeStat as keyof BoxPlotDataPoint] as number;
    }

    const xFraction = (value - xAxisConfig.xMin) / xAxisConfig.xRange;
    const xPercent = graphLeftPercent + xFraction * (graphRightPercent - graphLeftPercent) * barScaleFactor;

    // Calculate Y position based on top of each element (same offset as line graph: 12.5%)
    // Chart height is 220, center is 110
    // Box height: 90, Median height: 108, Min/Max height: 60
    const centerY = chartHeight / 2; // 110
    const offsetPercent = 12.5; // Same as line graph

    let elementTopY: number;
    if (activeStat === 'box') {
      const boxHeight = 90;
      elementTopY = centerY - boxHeight / 2; // 65
    } else if (activeStat === 'median') {
      const medianHeight = 108;
      elementTopY = centerY - medianHeight / 2; // 56
    } else {
      // min, max
      const minMaxHeight = 60;
      elementTopY = centerY - minMaxHeight / 2; // 80
    }

    // Convert to percentage and apply offset
    const elementTopPercent = (elementTopY / chartHeight) * 100;
    const yPercent = elementTopPercent - offsetPercent;

    return { xPercent, yPercent };
  };

  const bubblePosition = getBubblePosition();

  // X-axis labels from dynamic ticks
  const xLabels = xAxisConfig?.ticks.map((tickValue) => {
    const fraction = (tickValue - xAxisConfig.xMin) / xAxisConfig.xRange;
    const x = graphLeftPercent + fraction * (graphRightPercent - graphLeftPercent) * barScaleFactor;
    return { x, value: tickValue };
  }) ?? [];

  if (!activeData) {
    return null;
  }

  return (
    <div
      className="flex flex-col relative"
      style={{
        backgroundColor: 'transparent',
      }}
    >
      <div
        className="flex flex-col"
        style={{ gap: '8px', position: 'relative' }}
        onMouseEnter={() => setIsHoveringChart(true)}
        onMouseLeave={() => {
          setIsHoveringChart(false);
          setHoveredStat(null); // Clear hover when leaving chart area
        }}
      >
        {/* Chart area */}
        <div
          style={{
            width: '100%',
            aspectRatio: '1000 / 160',
            position: 'relative',
          }}
        >
          <BoxPlotChart
            data={activeData}
            hoveredStat={hoveredStat}
            onHoverStat={setHoveredStat}
            selectedStat={selectedStat}
            onSelectStat={setSelectedStat}
            isHoveringChart={isHoveringChart}
            onXAxisConfig={setXAxisConfig}
          />

          {/* Stats bubble - positioned relative to chart */}
          {bubblePosition && activeStat && displayValue && (
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
                style={{
                  ...aiGlassLightBorderStyle('1.5rem'),
                }}
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

        {/* X-axis line above labels */}
        <div
          style={{
            height: '2px',
            marginLeft: `${graphLeftPercent}%`,
            marginRight: `${100 - graphRightPercent}%`,
            background: 'linear-gradient(90deg, transparent 0%, rgba(124, 127, 130, 0.15) 10%, rgba(124, 127, 130, 0.15) 90%, transparent 100%)',
          }}
        />

        {/* X-axis labels below */}
        <div
          style={{
            position: 'relative',
            height: '24px',
            marginLeft: `${graphLeftPercent}%`,
            marginRight: `${100 - graphRightPercent}%`,
            marginTop: '8px',
            marginBottom: '8px',
          }}
        >
          {xLabels
            // When insetXAxisLabels is true, skip first and last labels
            .filter((_, index) => !insetXAxisLabels || (index !== 0 && index !== xLabels.length - 1))
            .map((label) => (
              <div
                key={`x-label-${label.value}`}
                style={{
                  position: 'absolute',
                  left: `${((label.x - graphLeftPercent) / (graphRightPercent - graphLeftPercent)) * 100}%`,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 350,
                  color: '#7C7F82',
                  textAlign: 'center',
                }}
              >
                {formatXAxis(label.value)}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default BoxPlotGraph;
