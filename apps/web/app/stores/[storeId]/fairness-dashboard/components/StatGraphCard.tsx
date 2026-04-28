import React, { useState, useEffect } from 'react';
import { CardSmall, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface SparklineCardData {
  type: 'sparkline';
  title: string;
  value: number;
  unit: string;
  status: string;
  sparklineData: number[];
  icon?: React.ReactNode;
}

interface PieCardData {
  type: 'pie';
  title: string;
  value: number;
  unit: string;
  status: string;
  pieData: { met: number; notMet: number };
  icon?: React.ReactNode;
}

interface BarCardData {
  type: 'bar';
  title: string;
  value: number | string; // Can be number or formatted string like "1 hr 30"
  unit: string;
  barUnit?: string; // Unit to show when a bar is selected (e.g., "crew" for histograms)
  status: string;
  barData: { role: string; hours: number }[];
  icon?: React.ReactNode;
}

interface StatusBarCardData {
  type: 'statusBar';
  title: string;
  status: string;
  barData: { role: string; value: number; status: string }[];
  icon?: React.ReactNode;
}

type MiniCardData = SparklineCardData | PieCardData | BarCardData | StatusBarCardData;

interface StatGraphCardProps {
  data: MiniCardData;
  children?: React.ReactNode;
}

const MAX_SPARKLINE_DOTS = 7;

// Mini sparkline component - interactive line chart with dots
function MiniSparkline({
  data,
  selectedIndex,
  hoveredIndex,
  lastHoveredIndex,
  isHoveringChart,
  onSelectPoint,
  onHoverPoint,
  onHoverChart,
}: {
  data: number[];
  selectedIndex: number;
  hoveredIndex: number | null;
  lastHoveredIndex: number | null;
  isHoveringChart: boolean;
  onSelectPoint: (index: number) => void;
  onHoverPoint: (index: number | null) => void;
  onHoverChart: (isHovering: boolean) => void;
}) {
  const width = 100;
  const height = 43;
  const padding = 6;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const dotRadius = 3;
  const dotStrokeWidth = 3;
  const dotOuterRadius = dotRadius + dotStrokeWidth / 2;

  const isHighDensity = data.length > MAX_SPARKLINE_DOTS;

  const points = data.map((value, index) => {
    const x = data.length === 1
      ? width - padding
      : padding + (index / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  // High density: just a line, no interaction
  if (isHighDensity) {
    return (
      <svg width={width} height={height} className="flex-shrink-0">
        <polyline
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#464548"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Normal density: trimmed segments between dots
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      segments.push({
        x1: p1.x + nx * dotOuterRadius,
        y1: p1.y + ny * dotOuterRadius,
        x2: p2.x - nx * dotOuterRadius,
        y2: p2.y - ny * dotOuterRadius,
      });
    }
  }

  return (
    <svg
      width={width}
      height={height}
      className="flex-shrink-0"
      onMouseEnter={() => onHoverChart(true)}
      onMouseLeave={() => {
        onHoverChart(false);
        onHoverPoint(null);
      }}
    >
      {segments.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke="#464548"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ))}
      {points.map((p, i) => {
        const isHovered = i === hoveredIndex;
        const isLastHovered = isHoveringChart && hoveredIndex === null && i === lastHoveredIndex;
        const showAsSelected = !isHoveringChart && i === selectedIndex;

        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={dotRadius}
            fill="none"
            stroke={isHovered || isLastHovered || showAsSelected ? '#ef4444' : '#464548'}
            strokeWidth={dotStrokeWidth}
            style={{ cursor: 'pointer', transition: 'stroke 0.15s ease' }}
            onClick={() => onSelectPoint(i)}
            onMouseEnter={() => onHoverPoint(i)}
          />
        );
      })}
    </svg>
  );
}

// Mini pie chart component - simple donut showing met vs not met
function MiniPieChart({ data }: { data: { met: number; notMet: number } }) {
  const size = 42;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const total = data.met + data.notMet;
  const metPercent = total > 0 ? data.met / total : 0;
  const metLength = circumference * metPercent;
  const notMetLength = circumference - metLength;
  
  return (
    <svg width={size} height={size} className="flex-shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      {/* Not met (background) */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#464548"
        strokeWidth={strokeWidth}
      />
      {/* Met (foreground) */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#ef4444"
        strokeWidth={strokeWidth}
        strokeDasharray={`${metLength} ${notMetLength}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

// Mini bar chart component - interactive vertical bars for role distribution
function MiniBarChart({
  data,
  selectedIndex,
  hoveredIndex,
  lastHoveredIndex,
  isHoveringChart,
  onSelectBar,
  onHoverBar,
  onHoverChart,
}: {
  data: { role: string; hours: number }[];
  selectedIndex: number;
  hoveredIndex: number | null;
  lastHoveredIndex: number | null;
  isHoveringChart: boolean;
  onSelectBar: (index: number) => void;
  onHoverBar: (index: number | null) => void;
  onHoverChart: (isHovering: boolean) => void;
}) {
  const width = 100;
  const height = 47;
  const barGap = 3;
  const barCount = data.length;
  const barWidth = (width - (barCount - 1) * barGap) / barCount;

  const max = Math.max(...data.map(d => d.hours));
  
  return (
    <svg 
      width={width} 
      height={height} 
      className="flex-shrink-0"
      onMouseEnter={() => onHoverChart(true)}
      onMouseLeave={() => {
        onHoverChart(false);
        onHoverBar(null);
      }}
    >
      {data.map((item, i) => {
        const rawBarHeight = max > 0 ? (item.hours / max) * (height - 4) : 0;
        const barHeight = rawBarHeight > 0 ? Math.max(3, rawBarHeight) : 0;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        const isHovered = i === hoveredIndex;
        const isLastHovered = isHoveringChart && hoveredIndex === null && i === lastHoveredIndex;
        const isSelected = i === selectedIndex;
        // Show as selected only when not hovering anywhere in the chart
        const showAsSelected = !isHoveringChart && isSelected;
        
        return (
          <rect
            key={i}
            x={x}
            y={isHovered ? y - 2 : y}
            width={barWidth}
            height={isHovered ? barHeight + 2 : barHeight}
            rx={barWidth / 2}
            fill={isHovered || isLastHovered || showAsSelected ? '#ef4444' : '#464548'}
            style={{
              cursor: 'pointer',
              transition: 'y 0.15s ease, height 0.15s ease, fill 0.15s ease',
            }}
            onClick={() => onSelectBar(i)}
            onMouseEnter={() => onHoverBar(i)}
          />
        );
      })}
    </svg>
  );
}

// Mini status bar chart component - shows role fairness with status labels
function MiniStatusBar({
  data,
  selectedIndex,
  hoveredIndex,
  lastHoveredIndex,
  isHoveringChart,
  onSelectBar,
  onHoverBar,
  onHoverChart,
}: {
  data: { role: string; value: number; status: string }[];
  selectedIndex: number;
  hoveredIndex: number | null;
  lastHoveredIndex: number | null;
  isHoveringChart: boolean;
  onSelectBar: (index: number) => void;
  onHoverBar: (index: number | null) => void;
  onHoverChart: (isHovering: boolean) => void;
}) {
  const width = 100;
  const height = 47;
  const barGap = 3;
  const barCount = data.length;
  const barWidth = (width - (barCount - 1) * barGap) / barCount;

  const max = Math.max(...data.map(d => d.value));

  function getStatusColor(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('excellent')) return '#60a5fa';
    if (s.includes('good')) return '#4ade80';
    if (s.includes('ok')) return '#fbbf24';
    if (s.includes('bad')) return '#f87171';
    return '#6b7280';
  }

  return (
    <svg
      width={width}
      height={height}
      className="flex-shrink-0"
      onMouseEnter={() => onHoverChart(true)}
      onMouseLeave={() => {
        onHoverChart(false);
        onHoverBar(null);
      }}
    >
      {data.map((item, i) => {
        const rawBarHeight = max > 0 ? (item.value / max) * (height - 4) : 0;
        const barHeight = rawBarHeight > 0 ? Math.max(3, rawBarHeight) : 0;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        const isHovered = i === hoveredIndex;
        const isLastHovered = isHoveringChart && hoveredIndex === null && i === lastHoveredIndex;
        const isSelected = i === selectedIndex;
        const showAsSelected = !isHoveringChart && isSelected;
        const activeColor = getStatusColor(item.status);

        return (
          <rect
            key={i}
            x={x}
            y={isHovered ? y - 2 : y}
            width={barWidth}
            height={isHovered ? barHeight + 2 : barHeight}
            rx={barWidth / 2}
            fill={isHovered || isLastHovered || showAsSelected ? activeColor : '#464548'}
            style={{
              cursor: 'pointer',
              transition: 'y 0.15s ease, height 0.15s ease, fill 0.15s ease',
            }}
            onClick={() => onSelectBar(i)}
            onMouseEnter={() => onHoverBar(i)}
          />
        );
      })}
    </svg>
  );
}

export function StatGraphCard({ data, children }: StatGraphCardProps) {
  // State for bar chart selected and hovered index
  const [selectedBarIndex, setSelectedBarIndex] = useState(0);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [lastHoveredBarIndex, setLastHoveredBarIndex] = useState<number | null>(null);
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  
  // State for sparkline selected and hovered index (starts at last point)
  const sparklineLength = data.type === 'sparkline' ? data.sparklineData.length : 0;
  const [selectedSparklineIndex, setSelectedSparklineIndex] = useState(sparklineLength > 0 ? sparklineLength - 1 : 0);
  const [hoveredSparklineIndex, setHoveredSparklineIndex] = useState<number | null>(null);
  const [lastHoveredSparklineIndex, setLastHoveredSparklineIndex] = useState<number | null>(null);
  const [isHoveringSparkline, setIsHoveringSparkline] = useState(false);
  
  // Update selected sparkline index when data changes (ensure it starts on last point)
  useEffect(() => {
    if (data.type === 'sparkline' && data.sparklineData.length > 0) {
      setSelectedSparklineIndex(data.sparklineData.length - 1);
    }
  }, [data.type === 'sparkline' ? data.sparklineData.length : 0]);
  
  // Track the last hovered bar
  const handleHoverBar = (index: number | null) => {
    setHoveredBarIndex(index);
    if (index !== null) {
      setLastHoveredBarIndex(index);
    }
  };
  
  // When leaving chart, clear last hovered
  const handleHoverChart = (isHovering: boolean) => {
    setIsHoveringChart(isHovering);
    if (!isHovering) {
      setLastHoveredBarIndex(null);
    }
  };
  
  // Track the last hovered sparkline point
  const handleHoverSparklinePoint = (index: number | null) => {
    setHoveredSparklineIndex(index);
    if (index !== null) {
      setLastHoveredSparklineIndex(index);
    }
  };
  
  // When leaving sparkline, clear last hovered
  const handleHoverSparkline = (isHovering: boolean) => {
    setIsHoveringSparkline(isHovering);
    if (!isHovering) {
      setLastHoveredSparklineIndex(null);
    }
  };
  
  // Get displayed sparkline index: hover > lastHovered (while in chart) > selected
  const getDisplayedSparklineIndex = () => {
    if (hoveredSparklineIndex !== null) return hoveredSparklineIndex;
    if (isHoveringSparkline && lastHoveredSparklineIndex !== null) return lastHoveredSparklineIndex;
    return selectedSparklineIndex;
  };
  const displayedSparklineIndex = getDisplayedSparklineIndex();
  const selectedSparklineData = data.type === 'sparkline' ? data.sparklineData[displayedSparklineIndex] : null;
  
  // Get displayed bar data: hover > lastHovered (while in chart) > selected
  const getDisplayedIndex = () => {
    if (hoveredBarIndex !== null) return hoveredBarIndex;
    if (isHoveringChart && lastHoveredBarIndex !== null) return lastHoveredBarIndex;
    return selectedBarIndex;
  };
  const displayedBarIndex = getDisplayedIndex();
  const selectedBarData = data.type === 'bar' ? data.barData[displayedBarIndex] : null;
  const selectedStatusBarData = data.type === 'statusBar' ? data.barData[displayedBarIndex] : null;

  return (
    <CardSmall
      lightMode={true}
      borderRadius="1.5rem"
      style={{ height: 128 }}
      contentStyle={{ padding: 0, position: 'relative' }}
    >
      {/* Top - Outer glass card wrapping title and status bubbles */}
      <div className="absolute" style={{ top: 0, left: 0, right: 0 }}>
        <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08) }}>
          <div
            style={{
              ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.4),
              padding: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {/* Title bubble */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
              <div
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.5),
                  padding: '8px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#2C2C2C',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {data.title}
              </div>
            </div>
            {/* Status bubble */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
              <div
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.5),
                  padding: '8px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: '#2C2C2C',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {data.type === 'bar' ? (selectedBarData ? selectedBarData.role : data.status) :
                 data.type === 'statusBar' ? (selectedStatusBarData ? selectedStatusBarData.role : data.status) :
                 data.status}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom right - Graph (positioned from bottom edge of graph) */}
      <div className="absolute" style={{ bottom: 16, right: 16 }}>
        {data.type === 'sparkline' && (
          <MiniSparkline 
            data={data.sparklineData}
            selectedIndex={selectedSparklineIndex}
            hoveredIndex={hoveredSparklineIndex}
            lastHoveredIndex={lastHoveredSparklineIndex}
            isHoveringChart={isHoveringSparkline}
            onSelectPoint={setSelectedSparklineIndex}
            onHoverPoint={handleHoverSparklinePoint}
            onHoverChart={handleHoverSparkline}
          />
        )}
        {data.type === 'pie' && <MiniPieChart data={data.pieData} />}
        {data.type === 'bar' && (
          <MiniBarChart 
            data={data.barData} 
            selectedIndex={selectedBarIndex}
            hoveredIndex={hoveredBarIndex}
            lastHoveredIndex={lastHoveredBarIndex}
            isHoveringChart={isHoveringChart}
            onSelectBar={setSelectedBarIndex}
            onHoverBar={handleHoverBar}
            onHoverChart={handleHoverChart}
          />
        )}
        {data.type === 'statusBar' && (
          <MiniStatusBar 
            data={data.barData} 
            selectedIndex={selectedBarIndex}
            hoveredIndex={hoveredBarIndex}
            lastHoveredIndex={lastHoveredBarIndex}
            isHoveringChart={isHoveringChart}
            onSelectBar={setSelectedBarIndex}
            onHoverBar={handleHoverBar}
            onHoverChart={handleHoverChart}
          />
        )}
      </div>
      
      {/* Bottom left - Value */}
      <div className="absolute" style={{ bottom: 12, left: 16 }}>
        {data.type === 'statusBar' ? (
          <span className="text-3xl" style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 500, lineHeight: 1, color: (() => {
            const status = selectedStatusBarData?.status.toLowerCase() || '';
            if (status.includes('excellent')) return '#60a5fa'; // blue
            if (status.includes('good')) return '#4ade80'; // green
            if (status.includes('ok')) return '#fbbf24'; // yellow
            if (status.includes('bad')) return '#f87171'; // red
            return '#DBDADB'; // default
          })() }}>
            {selectedStatusBarData ? selectedStatusBarData.status : ''}
          </span>
        ) : (
          <span className="text-3xl" style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 500, lineHeight: 1, color: '#2C2C2C' }}>
            {(() => {
              // Handle sparkline - show selected/hovered point value
              if (data.type === 'sparkline' && selectedSparklineData !== null && selectedSparklineData !== undefined) {
                return <>{selectedSparklineData}<span className="text-lg" style={{ color: '#7C7F82' }}> {data.unit}</span></>;
              }
              // Fallback to data.value for sparkline when no valid point is selected
              if (data.type === 'sparkline') {
                return <>{data.value}<span className="text-lg" style={{ color: '#7C7F82' }}> {data.unit}</span></>;
              }
              if (data.type === 'bar' && selectedBarData) {
                const mins = selectedBarData.hours;
                const hrs = Math.floor(mins / 60);
                const remainingMins = mins % 60;
                // Use barUnit if provided and NOT 'min' (e.g., "crew" for histograms)
                // For 'min' or no barUnit, show hr/min format
                if (data.barUnit && data.barUnit !== 'min') {
                  return <>{mins}<span className="text-lg" style={{ color: '#7C7F82' }}> {data.barUnit}</span></>;
                } else if (hrs > 0 && remainingMins > 0) {
                  return <>{hrs}<span className="text-lg" style={{ color: '#7C7F82' }}> hr </span>{remainingMins}<span className="text-lg" style={{ color: '#7C7F82' }}> min</span></>;
                } else if (hrs > 0) {
                  return <>{hrs}<span className="text-lg" style={{ color: '#7C7F82' }}> hr</span></>;
                } else {
                  return <>{mins}<span className="text-lg" style={{ color: '#7C7F82' }}> min</span></>;
                }
              }
              // Handle string values like "1 hr 30" from data.value
              if (typeof data.value === 'string' && data.value.includes(' hr ')) {
                const parts = data.value.split(' hr ');
                const hrs = parts[0];
                const mins = parts[1];
                return <>{hrs}<span className="text-lg" style={{ color: '#7C7F82' }}> hr </span>{mins}<span className="text-lg" style={{ color: '#7C7F82' }}> {data.unit}</span></>;
              }
              return <>{data.value}<span className="text-lg" style={{ color: '#7C7F82' }}> {data.unit}</span></>;
            })()}
          </span>
        )}
      </div>
      {children}
    </CardSmall>
  );
}
