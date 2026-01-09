import React, { useState, useEffect } from 'react';

// =============================================================================
// AI Glass Border Style - Faded corner border effect
// =============================================================================
const aiGlassBorderStyle = (
  borderRadius: string | number = '1rem',
  borderColor?: string,
  borderOpacity?: number
): React.CSSProperties => ({
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
  position: 'relative' as const,
  ...(borderColor && { '--border-color': borderColor } as React.CSSProperties),
  ...(borderOpacity !== undefined && { '--border-opacity': borderOpacity } as React.CSSProperties),
});

// CSS for the glass border pseudo-element (must be injected into the page)
export const statGraphCardStyles = `
  .stat-card-glass-border {
    position: relative;
    --border-color: 255, 255, 255;
    --border-opacity: 0.08;
  }
  .stat-card-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(20deg, transparent 0%, rgba(var(--border-color), var(--border-opacity)) 22%, rgba(var(--border-color), var(--border-opacity)) 78%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  .graph-container-glass-border {
    position: relative;
    --border-color: 255, 255, 255;
    --border-opacity: 0.08;
  }
  .graph-container-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(20deg, transparent 0%, rgba(var(--border-color), var(--border-opacity)) 22%, rgba(var(--border-color), var(--border-opacity)) 78%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  .circle-button-glass-border {
    position: relative;
    --border-color: 255, 255, 255;
    --border-opacity: 0.12;
  }
  .circle-button-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    padding: 1px;
    background: linear-gradient(20deg, transparent 0%, rgba(var(--border-color), var(--border-opacity)) 22%, rgba(var(--border-color), var(--border-opacity)) 78%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  .icon-button-glass-border {
    position: relative;
    --border-color: 255, 255, 255;
    --border-opacity: 0.12;
  }
  .icon-button-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(20deg, transparent 0%, rgba(var(--border-color), var(--border-opacity)) 22%, rgba(var(--border-color), var(--border-opacity)) 78%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  .quick-card-glass-border {
    --border-color: 255, 255, 255;
    --border-opacity: 0.08;
  }
  .quick-card-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(20deg, transparent 0%, rgba(var(--border-color), var(--border-opacity)) 22%, rgba(var(--border-color), var(--border-opacity)) 78%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
`;

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

const DefaultIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M11.625 16.5a1.875 1.875 0 1 0 0-3.75 1.875 1.875 0 0 0 0 3.75Z" />
    <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Zm6 16.5c.66 0 1.277-.19 1.797-.518l1.048 1.048a.75.75 0 0 0 1.06-1.06l-1.047-1.048A3.375 3.375 0 1 0 11.625 18Z" clipRule="evenodd" />
    <path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" />
  </svg>
);

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
  const width = 90;
  const height = 36;
  const padding = 6; // Increased padding to prevent dot clipping at edges
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  // Calculate points
  const points = data.map((value, index) => {
    // For single point, position at right edge; otherwise distribute across width
    const x = data.length === 1
      ? width - padding
      : padding + (index / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });
  
  // Create path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
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
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="#464548"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots */}
      {points.map((p, i) => {
        const isHovered = i === hoveredIndex;
        const isLastHovered = isHoveringChart && hoveredIndex === null && i === lastHoveredIndex;
        const isSelected = i === selectedIndex;
        // Show as selected only when not hovering anywhere in the chart
        const showAsSelected = !isHoveringChart && isSelected;
        
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isHovered ? 4 : 3}
            fill="#262628"
            stroke={isHovered || isLastHovered || showAsSelected ? '#888596' : '#464548'}
            strokeWidth={2}
            style={{ 
              cursor: 'pointer',
              transition: 'r 0.15s ease, stroke 0.15s ease',
            }}
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
  const size = 44;
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
        stroke="#888596"
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
  const width = 96;
  const height = 44;
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
        const barHeight = max > 0 ? (item.hours / max) * (height - 4) : 0;
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
            fill={isHovered || isLastHovered || showAsSelected ? '#888596' : '#464548'}
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
  const width = 96;
  const height = 44;
  const barGap = 3;
  const barCount = data.length;
  const barWidth = (width - (barCount - 1) * barGap) / barCount;
  
  const max = Math.max(...data.map(d => d.value));
  
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
        const barHeight = max > 0 ? (item.value / max) * (height - 4) : 0;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        const isHovered = i === hoveredIndex;
        const isLastHovered = isHoveringChart && hoveredIndex === null && i === lastHoveredIndex;
        const isSelected = i === selectedIndex;
        const showAsSelected = !isHoveringChart && isSelected;
        
        return (
          <rect
            key={i}
            x={x}
            y={isHovered ? y - 2 : y}
            width={barWidth}
            height={isHovered ? barHeight + 2 : barHeight}
            rx={barWidth / 2}
            fill={isHovered || isLastHovered || showAsSelected ? '#888596' : '#464548'}
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
    <div 
      className="stat-card-glass-border" 
      style={{ 
        ...aiGlassBorderStyle('1rem', '255, 255, 255', 0.08),
        height: 120,
      }}
    >
      <div 
        className="relative w-full h-full" 
        style={{ 
          borderRadius: '1rem', 
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Top left - Icon */}
        <div 
          className="absolute flex items-center justify-center rounded-md icon-button-glass-border"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', width: 24, height: 24, top: 16, left: 16 }}
      >
        <span style={{ color: '#8a8a8f' }}>
          {data.icon || <DefaultIcon />}
        </span>
      </div>
      
      {/* Top right - Status */}
      <span className="absolute text-[13px]" style={{ fontFamily: 'var(--font-open-sans)', color: '#7C7F82', fontWeight: 350, top: 16, right: 16, lineHeight: 1, textAlign: 'right' }}>
        {data.type === 'bar' ? (selectedBarData ? selectedBarData.role : data.status) :
         data.type === 'statusBar' ? (selectedStatusBarData ? selectedStatusBarData.role : data.status) :
         data.status}
      </span>
      
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
      
      {/* Bottom left - Text content (offset by ~6px to account for text descender space) */}
      <div className="absolute" style={{ bottom: 10, left: 16 }}>
        {data.type === 'statusBar' ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="text-[14px]" style={{ fontFamily: 'var(--font-open-sans)', color: '#7C7F82', fontWeight: 350 }}>
              {data.title}
            </span>
            <span className="text-2xl" style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 500, color: (() => {
              const status = selectedStatusBarData?.status.toLowerCase() || '';
              if (status.includes('excellent')) return '#4ade80'; // green
              if (status.includes('good')) return '#60a5fa'; // blue
              if (status.includes('ok')) return '#fbbf24'; // yellow
              if (status.includes('bad')) return '#f87171'; // red
              return '#DBDADB'; // default
            })() }}>
              {selectedStatusBarData ? selectedStatusBarData.status : ''}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="text-[14px]" style={{ fontFamily: 'var(--font-open-sans)', color: '#7C7F82', fontWeight: 350 }}>
              {data.title}
            </span>
            <span className="text-2xl" style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 500, color: '#FFFFFF' }}>
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
          </div>
        )}
      </div>
      {children}
    </div>
    </div>
  );
}
