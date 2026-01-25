'use client';

import React, { useState } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

interface BoxPlotData {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: number[];
}

type HoveredPart = 'min' | 'q1' | 'median' | 'q3' | 'max' | 'box' | null;

// BoxPlot component matching the simplistic aesthetic of mini card graphs
function BoxPlot({ 
  data, 
  hoveredPart, 
  onHover 
}: { 
  data: BoxPlotData; 
  hoveredPart: HoveredPart;
  onHover: (part: HoveredPart) => void;
}) {
  const boxAreaHeight = 64; // Height of actual box plot content
  const baselineGap = 16; // Gap between box and baseline (matches gap below baseline to labels)
  const boxHeight = boxAreaHeight + baselineGap; // Total height including gap
  const xAxisHeight = 32;
  const height = boxHeight + xAxisHeight;
  const padding = 16;
  
  // Calculate the range for scaling (include outliers if present)
  const allValues = [data.min, data.max, ...(data.outliers || [])];
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  
  // Handle edge case: no data or all zeros - show empty state
  if (dataMin === dataMax || (dataMin === 0 && dataMax === 0)) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#7C7F82',
          fontSize: '14px',
          fontFamily: 'var(--font-open-sans)',
          fontWeight: 350,
        }}
      >
        No satisfaction data available
      </div>
    );
  }
  
  // X-axis: whole numbers, tight range around the data
  const xAxisStart = Math.floor(dataMin / 5) * 5; // Round down to nearest 5
  const xAxisEnd = Math.ceil(dataMax / 5) * 5; // Round up to nearest 5
  const xAxisRange = xAxisEnd - xAxisStart || 1; // Prevent division by zero

  // Calculate optimal step size to limit labels (aim for 5-7 labels max)
  const targetLabelCount = 6;
  const rawStep = xAxisRange / (targetLabelCount - 1);

  // Round step to nice numbers (5, 10, 15, 20, 25, 30, etc.)
  let step = 5;
  if (rawStep > 5) {
    const possibleSteps = [10, 15, 20, 25, 30, 40, 50, 60, 100, 150, 200];
    step = possibleSteps.find(s => s >= rawStep) || 200;
  }

  // Generate whole number ticks with calculated step size
  const xLabels: number[] = [];
  for (let i = xAxisStart; i <= xAxisEnd; i += step) {
    xLabels.push(i);
  }
  // Always include the end point if it's not already there
  if (xLabels[xLabels.length - 1] !== xAxisEnd) {
    xLabels.push(xAxisEnd);
  }
  const xTicks = xLabels.length;
  
  // Scale function to convert data value to percentage position
  const scale = (value: number) => {
    return ((value - xAxisStart) / xAxisRange) * 100;
  };
  
  const minPos = scale(data.min);
  const q1Pos = scale(data.q1);
  const medianPos = scale(data.median);
  const q3Pos = scale(data.q3);
  const maxPos = scale(data.max);
  
  return (
    <svg 
      width="100%" 
      height={height} 
      style={{ overflow: 'visible' }}
      preserveAspectRatio="none"
    >
      {/* X-axis labels */}
      {Array.from({ length: xTicks }).map((_, i) => {
        const x = (i / (xTicks - 1)) * 100;
        return (
          <g key={i}>
            {/* Label */}
            <text
              x={`${x}%`}
              y={boxHeight + 26}
              textAnchor="middle"
              fontSize="14"
              fontFamily="var(--font-open-sans), sans-serif"
              fontWeight="350"
              fill="#7C7F82"
              style={{ userSelect: 'none' }}
            >
              {xLabels[i]}
            </text>
          </g>
        );
      })}
      
      {/* Gradient and blur filter definitions */}
      <defs>
        {/* Gradient for the x-axis baseline - fades in/out with 2 gaps for broken look */}
        <linearGradient id="baselineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          {/* Fade in */}
          <stop offset="0%" stopColor="#7C7F82" stopOpacity={0.05} />
          <stop offset="15%" stopColor="#7C7F82" stopOpacity={0.25} />
          {/* First gap */}
          <stop offset="25%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="35%" stopColor="#7C7F82" stopOpacity={0.08} />
          <stop offset="45%" stopColor="#7C7F82" stopOpacity={0.08} />
          <stop offset="55%" stopColor="#7C7F82" stopOpacity={0.25} />
          {/* Second gap */}
          <stop offset="65%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="75%" stopColor="#7C7F82" stopOpacity={0.08} />
          <stop offset="85%" stopColor="#7C7F82" stopOpacity={0.25} />
          {/* Fade out */}
          <stop offset="100%" stopColor="#7C7F82" stopOpacity={0.05} />
        </linearGradient>
        
        {/* Gradient for vertical grid lines - fades from edges to center, bottom 5% completely gone */}
        <linearGradient id="verticalLineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7C7F82" stopOpacity={0.05} />
          <stop offset="40%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="60%" stopColor="#7C7F82" stopOpacity={0.25} />
          <stop offset="85%" stopColor="#7C7F82" stopOpacity={0.05} />
          <stop offset="100%" stopColor="#7C7F82" stopOpacity={0} />
        </linearGradient>
        
        <linearGradient id="boxGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A09FA3" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#6A696D" stopOpacity={0.3} />
        </linearGradient>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
        {/* Distortion filter with turbulence for wavy glass effect */}
        <filter id="distort" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise" seed="5" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="2" />
        </filter>
        {/* Frosted glass texture filter - adds noise throughout the box */}
        <filter id="frostedGlass" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" result="noise" seed="15" />
          <feColorMatrix type="saturate" values="0" result="monoNoise" />
          <feBlend in="SourceGraphic" in2="monoNoise" mode="overlay" result="blended" />
          <feGaussianBlur in="blended" stdDeviation="1.5" />
        </filter>
        {/* Clip path for rounded corners */}
        <clipPath id="boxClip">
          <rect
            x={`${q1Pos}%`}
            y={8}
            width={`${q3Pos - q1Pos}%`}
            height={boxAreaHeight - 16}
            rx={13}
            ry={13}
          />
        </clipPath>
        {/* AI glass border gradient for box */}
        <linearGradient id="aiBoxBorderGradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />
          <stop offset="22%" stopColor="rgba(255, 255, 255, 0.15)" />
          <stop offset="78%" stopColor="rgba(255, 255, 255, 0.15)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </linearGradient>
      </defs>
      
      {/* Vertical grid lines at each x-axis mark */}
      {Array.from({ length: xTicks }).map((_, i) => {
        const x = (i / (xTicks - 1)) * 100;
        return (
          <rect
            key={`vline-${i}`}
            x={`calc(${x}% - 0.75px)`}
            y={0}
            width={1.5}
            height={boxHeight}
            fill="url(#verticalLineGradient)"
          />
        );
      })}
      
      {/* X-axis baseline at y=boxHeight with fading gradient */}
      <rect
        x="0%"
        y={boxHeight - 0.75}
        width="100%"
        height={1.5}
        fill="url(#baselineGradient)"
      />
      
      {/* Whisker line (min to Q1) */}
      <line
        x1={`${minPos}%`}
        y1={boxAreaHeight / 2}
        x2={`${q1Pos}%`}
        y2={boxAreaHeight / 2}
        stroke="#C3C3CB"
        strokeWidth={3}
        style={{ 
          opacity: hoveredPart === null ? 1 : 0.3,
          transition: 'opacity 0.15s ease',
        }}
      />
      
      {/* Whisker line (Q3 to max) */}
      <line
        x1={`${q3Pos}%`}
        y1={boxAreaHeight / 2}
        x2={`${maxPos}%`}
        y2={boxAreaHeight / 2}
        stroke="#C3C3CB"
        strokeWidth={3}
        style={{ 
          opacity: hoveredPart === null ? 1 : 0.3,
          transition: 'opacity 0.15s ease',
        }}
      />
      
      {/* Min whisker cap */}
      <line
        x1={`${minPos}%`}
        y1={boxAreaHeight / 2 - 16}
        x2={`${minPos}%`}
        y2={boxAreaHeight / 2 + 16}
        stroke={hoveredPart === 'min' ? '#FFFFFF' : '#C3C3CB'}
        strokeWidth={6}
        strokeLinecap="round"
        style={{ 
          cursor: 'pointer',
          opacity: hoveredPart === null ? 1 : (hoveredPart === 'min' ? 1 : 0.3),
          transition: 'opacity 0.15s ease, stroke 0.15s ease',
        }}
        onMouseEnter={() => onHover('min')}
        onMouseLeave={() => onHover(null)}
      />
      
      {/* Max whisker cap */}
      <line
        x1={`${maxPos}%`}
        y1={boxAreaHeight / 2 - 16}
        x2={`${maxPos}%`}
        y2={boxAreaHeight / 2 + 16}
        stroke={hoveredPart === 'max' ? '#FFFFFF' : '#C3C3CB'}
        strokeWidth={6}
        strokeLinecap="round"
        style={{ 
          cursor: 'pointer',
          opacity: hoveredPart === null ? 1 : (hoveredPart === 'max' ? 1 : 0.3),
          transition: 'opacity 0.15s ease, stroke 0.15s ease',
        }}
        onMouseEnter={() => onHover('max')}
        onMouseLeave={() => onHover(null)}
      />
      
      {/* Box (Q1 to Q3) - solid gradient matching stacked bars */}
      <rect
        x={`${q1Pos}%`}
        y={8}
        width={`${q3Pos - q1Pos}%`}
        height={boxAreaHeight - 16}
        rx={13}
        ry={13}
        fill={hoveredPart === 'box' ? 'url(#boxGradient)' : 'url(#boxGradient)'}
        style={{ 
          cursor: 'pointer',
          opacity: hoveredPart === null ? 1 : (hoveredPart === 'box' ? 1 : 0.3),
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={() => onHover('box')}
        onMouseLeave={() => onHover(null)}
      />
      
      {/* Median line - pill shaped like whisker caps */}
      <line
        x1={`${medianPos}%`}
        y1={2}
        x2={`${medianPos}%`}
        y2={boxAreaHeight - 2}
        stroke={hoveredPart === 'median' ? '#FFFFFF' : '#C3C3CB'}
        strokeWidth={6}
        strokeLinecap="round"
        style={{ 
          cursor: 'pointer',
          opacity: hoveredPart === null ? 1 : (hoveredPart === 'median' ? 1 : 0.3),
          transition: 'opacity 0.15s ease, stroke 0.15s ease',
        }}
        onMouseEnter={() => onHover('median')}
        onMouseLeave={() => onHover(null)}
      />
      
      {/* Outliers */}
      {data.outliers?.map((outlier, i) => (
        <circle
          key={i}
          cx={`${scale(outlier)}%`}
          cy={boxAreaHeight / 2}
          r={4}
          fill="#262628"
          stroke="#888596"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

interface GraphCardWithStatsTransparentProps {
  title: string;
  stats?: {
    label: string;
    value: string | number;
    unit?: string;
  }[];
  boxPlotData?: BoxPlotData;
  boxPlotType?: 'satisfaction' | 'time'; // Type of box plot for hover descriptions
  isSingleCrew?: boolean; // Whether this is for a single crew member (affects description wording)
  children?: React.ReactNode;
}

export function GraphCardWithStatsTransparent({
  title,
  stats = [],
  boxPlotData,
  boxPlotType = 'time', // Default to time-based for backward compatibility
  isSingleCrew = false, // Default to multiple crew context
  children
}: GraphCardWithStatsTransparentProps) {
  const [hoveredPart, setHoveredPart] = useState<HoveredPart>(null);

  // Format minutes to readable string (e.g., "30 min", "1 hr 10 min", "2 hr")
  const formatMinutesToReadable = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (mins === 0) {
      return `${hours} hr`;
    }
    return `${hours} hr ${mins} min`;
  };

  // Format satisfaction score as percentage with 1 decimal place
  const formatSatisfactionScore = (score: number): string => {
    return `${score.toFixed(1)}%`;
  };

  // Generate hover description for box plot parts
  const getHoverDescription = (): string | null => {
    if (!boxPlotData || hoveredPart === null) return null;

    if (boxPlotType === 'satisfaction') {
      if (isSingleCrew) {
        // Single crew member - use singular descriptions
        switch (hoveredPart) {
          case 'min':
            return `Lowest shift: ${formatSatisfactionScore(boxPlotData.min)}`;
          case 'max':
            return `Highest shift: ${formatSatisfactionScore(boxPlotData.max)}`;
          case 'median':
            return `Typical shift: ${formatSatisfactionScore(boxPlotData.median)}`;
          case 'box':
          case 'q1':
          case 'q3':
            return `Most shifts scored between ${formatSatisfactionScore(boxPlotData.q1)} and ${formatSatisfactionScore(boxPlotData.q3)}`;
          default:
            return null;
        }
      } else {
        // Multiple crew - use plural descriptions
        switch (hoveredPart) {
          case 'min':
            return `Lowest: ${formatSatisfactionScore(boxPlotData.min)}`;
          case 'max':
            return `Highest: ${formatSatisfactionScore(boxPlotData.max)}`;
          case 'median':
            return `Typical: ${formatSatisfactionScore(boxPlotData.median)}`;
          case 'box':
          case 'q1':
          case 'q3':
            return `Most crew scored between ${formatSatisfactionScore(boxPlotData.q1)} and ${formatSatisfactionScore(boxPlotData.q3)}`;
          default:
            return null;
        }
      }
    } else {
      // Time-based descriptions
      switch (hoveredPart) {
        case 'min':
          return `Shortest: ${formatMinutesToReadable(boxPlotData.min)}`;
        case 'max':
          return `Longest: ${formatMinutesToReadable(boxPlotData.max)}`;
        case 'median':
          return `Typical: ${formatMinutesToReadable(boxPlotData.median)}`;
        case 'box':
        case 'q1':
        case 'q3':
          return `Most crew worked between ${formatMinutesToReadable(boxPlotData.q1)} and ${formatMinutesToReadable(boxPlotData.q3)}`;
        default:
          return null;
      }
    }
  };

  const hoverDescription = getHoverDescription();

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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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
        
        {/* Stats row */}
        {stats.length > 0 && (
          <div className="flex gap-4">
            {stats.map((stat, index) => (
              <div key={index} className="flex items-baseline gap-1">
                <span 
                  className="text-[12px]" 
                  style={{ 
                    fontFamily: 'var(--font-open-sans)', 
                    color: '#7C7F82', 
                    fontWeight: 350 
                  }}
                >
                  {stat.label}:
                </span>
                <span 
                  className="text-[14px]" 
                  style={{ 
                    fontFamily: 'var(--font-open-sans)', 
                    color: '#DBDADB', 
                    fontWeight: 500 
                  }}
                >
                  {stat.value}
                </span>
                {stat.unit && (
                  <span 
                    className="text-[12px]" 
                    style={{ 
                      fontFamily: 'var(--font-open-sans)', 
                      color: '#7C7F82', 
                      fontWeight: 350 
                    }}
                  >
                    {stat.unit}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Graph area */}
      <div className="flex-1 w-full">
        {boxPlotData && (
          <BoxPlot 
            data={boxPlotData} 
            hoveredPart={hoveredPart}
            onHover={setHoveredPart}
          />
        )}
        {children}
      </div>
      
      {/* Hover description - appears below graph on hover */}
      {boxPlotData && (
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
              opacity: hoverDescription ? 1 : 0,
              transition: 'opacity 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {hoverDescription}
          </span>
        </div>
      )}
    </div>
  );
}
