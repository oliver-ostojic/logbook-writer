import React, { useState } from 'react';

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
  value: number;
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

// Mini sparkline component - just line and dots, no axes
function MiniSparkline({ data }: { data: number[] }) {
  const width = 90;
  const height = 36;
  const padding = 4;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  // Calculate points
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });
  
  // Create path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  return (
    <svg width={width} height={height} className="flex-shrink-0">
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
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          fill="#262628"
          stroke={i === points.length - 1 ? '#888596' : '#464548'}
          strokeWidth={2}
        />
      ))}
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
            y={y}
            width={barWidth}
            height={barHeight}
            rx={barWidth / 2}
            fill={isHovered || isLastHovered || showAsSelected ? '#888596' : '#464548'}
            style={{ cursor: 'pointer' }}
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
            y={y}
            width={barWidth}
            height={barHeight}
            rx={barWidth / 2}
            fill={isHovered || isLastHovered || showAsSelected ? '#888596' : '#464548'}
            style={{ cursor: 'pointer' }}
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
  
  // Get displayed bar data: hover > lastHovered (while in chart) > selected
  const getDisplayedIndex = () => {
    if (hoveredBarIndex !== null) return hoveredBarIndex;
    if (isHoveringChart && lastHoveredBarIndex !== null) return lastHoveredBarIndex;
    return selectedBarIndex;
  };
  const displayedBarIndex = getDisplayedIndex();
  const selectedBarData = data.type === 'bar' ? data.barData[displayedBarIndex] : null;
  const selectedStatusBarData = data.type === 'statusBar' ? data.barData[displayedBarIndex] : null;

  const [isCardHovered, setIsCardHovered] = useState(false);

  return (
    <div 
      className="relative" 
      style={{ 
        borderRadius: '1rem', 
        height: 120,
        overflow: 'hidden',
        background: isCardHovered 
          ? 'rgba(255, 255, 255, 0.12)' 
          : 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        transition: 'background 0.2s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Top left - Icon */}
      <div 
        className="absolute flex items-center justify-center rounded-md"
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
        {data.type === 'sparkline' && <MiniSparkline data={data.sparklineData} />}
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
            <span className="text-2xl" style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 500, color: '#DBDADB' }}>
              {selectedStatusBarData ? selectedStatusBarData.status : ''}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="text-[14px]" style={{ fontFamily: 'var(--font-open-sans)', color: '#7C7F82', fontWeight: 350 }}>
              {data.title}
            </span>
            <span className="text-2xl" style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 500, color: '#FFFFFF' }}>
              {data.type === 'bar' && selectedBarData ? selectedBarData.hours : data.value}
              <span className="text-lg" style={{ color: '#7C7F82' }}> {data.type === 'bar' && selectedBarData && data.barUnit ? data.barUnit : data.unit}</span>
            </span>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
